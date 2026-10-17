/**
 * CSV / Excel market-data importer (DAT-001).
 *
 * Produces the same typed artefacts as the live Yahoo path (`RawPriceData` +
 * `DatasetMetadata`) so the imported dataset flows unchanged through
 * `buildReturnsDataset` and every downstream model.  No interpolation, no
 * forward-fill, nothing invented: every row dropped is counted and reported.
 */
import * as XLSX from 'xlsx';
import type { DatasetMetadata, MarketDataSource, RawPriceData } from './types';

export interface ImportIssue {
  /** 1-based source row (header = row 1). */
  row?: number;
  code:
    | 'MISSING_DATE_COLUMN' | 'MISSING_PRICE_COLUMN' | 'EMPTY_FILE'
    | 'INVALID_DATE' | 'AMBIGUOUS_DATE' | 'INVALID_NUMBER'
    | 'NON_POSITIVE_PRICE' | 'MISSING_PRICE' | 'DUPLICATE_DATE'
    | 'OUT_OF_ORDER' | 'MULTIPLE_TICKERS';
  detail: string;
}

export interface ImportReport {
  fileName: string;
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
  columns: { date: string; close: string; adjclose?: string; ticker?: string };
  dateFormat: 'ISO' | 'DMY' | 'MDY' | 'MIXED';
  issues: ImportIssue[];
  tickers: string[];
}

export interface ImportResult {
  /** Null when the import failed; callers must not replace a previously valid dataset in that case. */
  raw: RawPriceData | null;
  metadata: DatasetMetadata | null;
  report: ImportReport;
  ok: boolean;
}

export interface ImportOptions {
  fileName: string;
  /** Override the ticker when the file does not contain one. */
  ticker?: string;
  /** Override the currency label. */
  currency?: string | null;
  /** Column overrides, taking precedence over auto-detection. */
  columns?: Partial<ImportReport['columns']>;
  source?: MarketDataSource; // defaults to 'CSV' / 'Excel' from the file extension
}

/* ------------------------------------------------------------------ */
/* Column detection                                                   */
/* ------------------------------------------------------------------ */
const normalize = (h: string) => h.trim().toLowerCase().replace(/[\s_.-]+/g, '');

const COLUMN_ALIASES: Record<keyof ImportReport['columns'], string[]> = {
  date: ['date', 'fecha', 'timestamp', 'tradedate', 'day', 'datetime'],
  close: ['close', 'closelast', 'closingprice', 'price', 'precio', 'lastprice', 'last'],
  adjclose: ['adjclose', 'adjustedclose', 'adjustedclosingprice', 'adjprice'],
  ticker: ['ticker', 'symbol', 'symb', 'security', 'instrument'],
};

function detectColumns(headers: string[], override?: Partial<ImportReport['columns']>): { cols: ImportReport['columns']; issues: ImportIssue[] } {
  const normalized = headers.map(normalize);
  const find = (aliases: string[]) => {
    for (const a of aliases) {
      const i = normalized.indexOf(a);
      if (i >= 0) return headers[i];
    }
    return undefined;
  };
  const date = override?.date ?? find(COLUMN_ALIASES.date);
  // Prefer the plain close; adjclose is tracked separately so the Returns
  // Engine can keep the field distinction.
  const close = override?.close ?? find(COLUMN_ALIASES.close.filter((a) => !a.startsWith('adj')))
    ?? find(COLUMN_ALIASES.adjclose);
  const adjclose = override?.adjclose ?? (close && !COLUMN_ALIASES.adjclose.includes(normalize(close)) ? find(COLUMN_ALIASES.adjclose) : undefined);
  const ticker = override?.ticker ?? find(COLUMN_ALIASES.ticker);
  const issues: ImportIssue[] = [];
  if (!date) issues.push({ code: 'MISSING_DATE_COLUMN', detail: `No date column found. Accepted names: ${COLUMN_ALIASES.date.join(', ')}` });
  if (!close) issues.push({ code: 'MISSING_PRICE_COLUMN', detail: `No price column found. Accepted names: ${[...COLUMN_ALIASES.close, ...COLUMN_ALIASES.adjclose].join(', ')}` });
  return { cols: { date: date!, close: close!, adjclose, ticker }, issues };
}

/* ------------------------------------------------------------------ */
/* Date parsing                                                       */
/* ------------------------------------------------------------------ */
const pad = (n: number) => n.toString().padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const isValid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

interface ParsedDate { iso: string | null; ambiguous: boolean; format: 'ISO' | 'DMY' | 'MDY' | null }

/**
 * Parses one cell as a date.  Formats supported: ISO (YYYY-MM-DD, YYYY/MM/DD),
 * unambiguous DMY/MDY (day > 12 ⇒ DMY, month > 12 ⇒ MDY), and Excel serial
 * numbers.  Ambiguous DMY/MDY (both components ≤ 12) is flagged, not guessed.
 */
export function parseCellDate(cell: unknown): ParsedDate {
  if (cell === null || cell === undefined || cell === '') return { iso: null, ambiguous: false, format: null };
  // Excel serial number (days since 1899-12-30, Lotus-compatible epoch).
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    const ms = Math.round((cell - 25569) * 86_400_000);
    const dt = new Date(ms);
    if (!Number.isFinite(dt.getTime())) return { iso: null, ambiguous: false, format: null };
    return { iso: iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()), ambiguous: false, format: 'ISO' };
  }
  if (cell instanceof Date) {
    if (!Number.isFinite(cell.getTime())) return { iso: null, ambiguous: false, format: null };
    return { iso: iso(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate()), ambiguous: false, format: 'ISO' };
  }
  const s = String(cell).trim().split(/[T\s]/)[0];
  if (!s) return { iso: null, ambiguous: false, format: null };
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, Y, M, D] = isoMatch; const y = +Y, m = +M, d = +D;
    return isValid(y, m, d) ? { iso: iso(y, m, d), ambiguous: false, format: 'ISO' } : { iso: null, ambiguous: false, format: null };
  }
  const dm = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dm) {
    let [, A, B, Y] = dm; const a = +A, b = +B;
    const yNum = +Y + (Y.length === 2 ? (+Y >= 70 ? 1900 : 2000) : 0);
    if (a > 12 && isValid(yNum, b, a)) return { iso: iso(yNum, b, a), ambiguous: false, format: 'DMY' };
    if (b > 12 && isValid(yNum, a, b)) return { iso: iso(yNum, a, b), ambiguous: false, format: 'MDY' };
    if (a <= 12 && b <= 12 && isValid(yNum, a, b)) return { iso: iso(yNum, a, b), ambiguous: true, format: null };
  }
  return { iso: null, ambiguous: false, format: null };
}

/* ------------------------------------------------------------------ */
/* Number parsing                                                     */
/* ------------------------------------------------------------------ */
export function parseCellNumber(cell: unknown): number | null {
  if (cell === null || cell === undefined || cell === '') return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  // Accept $, €, thousand separators (comma OR dot) heuristically; if the
  // string contains both, treat the LAST one as the decimal mark.
  let s = String(cell).trim().replace(/[\s$€£¥]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (s === '' || s === '-') return null;
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    // Lone comma — assume decimal if there are 1–3 digits after it, else thousands.
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length <= 3 ? parts.join('.') : parts.join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Core importer (header + row objects)                               */
/* ------------------------------------------------------------------ */
export function importMarketData(headers: string[], rows: Record<string, unknown>[], opts: ImportOptions): ImportResult {
  const issues: ImportIssue[] = [];
  const { cols, issues: colIssues } = detectColumns(headers, opts.columns);
  issues.push(...colIssues);

  const report: ImportReport = {
    fileName: opts.fileName,
    rowsRead: rows.length,
    rowsAccepted: 0,
    rowsRejected: 0,
    columns: cols,
    dateFormat: 'ISO',
    issues,
    tickers: [],
  };

  if (rows.length === 0) {
    report.issues.push({ code: 'EMPTY_FILE', detail: 'No data rows found' });
    return { raw: null, metadata: null, report, ok: false };
  }
  if (colIssues.length > 0) {
    report.rowsRejected = rows.length;
    return { raw: null, metadata: null, report, ok: false };
  }

  const dates: string[] = [];
  const closes: (number | null)[] = [];
  const adjcloses: (number | null)[] = [];
  const formats = new Set<'ISO' | 'DMY' | 'MDY'>();
  const seenDates = new Set<string>();
  const tickerSet = new Set<string>();
  let lastIso: string | null = null;
  let outOfOrderFlagged = false;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // header is row 1
    if (cols.ticker) {
      const t = r[cols.ticker];
      if (t !== null && t !== undefined && t !== '') tickerSet.add(String(t).trim().toUpperCase());
    }
    const parsed = parseCellDate(r[cols.date]);
    if (parsed.iso === null) {
      report.rowsRejected++;
      if (parsed.ambiguous) issues.push({ row: rowNum, code: 'AMBIGUOUS_DATE', detail: `Ambiguous DMY/MDY date "${String(r[cols.date] ?? '')}" — provide ISO YYYY-MM-DD` });
      else issues.push({ row: rowNum, code: 'INVALID_DATE', detail: `Unrecognized date "${String(r[cols.date] ?? '')}"` });
      continue;
    }
    if (parsed.format) formats.add(parsed.format);
    const rawClose = r[cols.close];
    const price = parseCellNumber(rawClose);
    if (price === null) {
      report.rowsRejected++;
      if (rawClose === null || rawClose === undefined || rawClose === '') issues.push({ row: rowNum, code: 'MISSING_PRICE', detail: `Missing price at ${parsed.iso}` });
      else issues.push({ row: rowNum, code: 'INVALID_NUMBER', detail: `Non-numeric price "${String(rawClose)}" at ${parsed.iso}` });
      continue;
    }
    if (price <= 0) {
      report.rowsRejected++;
      issues.push({ row: rowNum, code: 'NON_POSITIVE_PRICE', detail: `Non-positive price ${price} at ${parsed.iso}` });
      continue;
    }
    if (seenDates.has(parsed.iso)) {
      report.rowsRejected++;
      issues.push({ row: rowNum, code: 'DUPLICATE_DATE', detail: `Duplicate date ${parsed.iso}` });
      continue;
    }
    seenDates.add(parsed.iso);
    if (!outOfOrderFlagged && lastIso && parsed.iso < lastIso) {
      outOfOrderFlagged = true;
      issues.push({ code: 'OUT_OF_ORDER', detail: 'Rows were not chronological; sorted by date before computing returns' });
    }
    lastIso = parsed.iso;
    dates.push(parsed.iso);
    closes.push(price);
    if (cols.adjclose) adjcloses.push(parseCellNumber(r[cols.adjclose]));
  }

  // Stable sort by date — cleanPrices will not re-order further.
  const idx = dates.map((_, i) => i).sort((a, b) => (dates[a] < dates[b] ? -1 : dates[a] > dates[b] ? 1 : 0));
  const sortedDates = idx.map((i) => dates[i]);
  const sortedCloses = idx.map((i) => closes[i]);
  const sortedAdj = cols.adjclose ? idx.map((i) => adjcloses[i]) : undefined;

  report.rowsAccepted = sortedDates.length;
  report.tickers = Array.from(tickerSet);
  report.dateFormat = formats.size > 1 ? 'MIXED' : formats.size === 1 ? [...formats][0] : 'ISO';

  if (report.tickers.length > 1) {
    issues.push({ code: 'MULTIPLE_TICKERS', detail: `File contains multiple tickers (${report.tickers.join(', ')}). Split per instrument.` });
    return { raw: null, metadata: null, report, ok: false };
  }

  if (sortedDates.length === 0) return { raw: null, metadata: null, report, ok: false };

  const ticker = opts.ticker ?? report.tickers[0] ?? opts.fileName.replace(/\.[^.]+$/, '').toUpperCase();
  const source: MarketDataSource = opts.source ?? (opts.fileName.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel');
  const metadata: DatasetMetadata = {
    source, ticker, currency: opts.currency ?? null, frequency: 'daily',
    history: `${sortedDates[0]} → ${sortedDates.at(-1)}`,
    updateMethod: `File import (${opts.fileName})`,
    retrievedAt: new Date().toISOString(),
  };
  const raw: RawPriceData = { dates: sortedDates, closes: sortedCloses, ...(sortedAdj ? { adjcloses: sortedAdj } : {}) };
  return { raw, metadata, report, ok: true };
}

/* ------------------------------------------------------------------ */
/* CSV & XLSX adapters                                                */
/* ------------------------------------------------------------------ */

/** RFC-4180 CSV splitter: handles quoted fields and embedded commas. */
export function parseCSV(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const stripped = text.replace(/^\uFEFF/, '');
  const lines: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  const sep = detectSeparator(stripped);
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (inQuotes) {
      if (c === '"' && stripped[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || row.length) { row.push(field); lines.push(row); row = []; field = ''; }
        if (c === '\r' && stripped[i + 1] === '\n') i++;
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); lines.push(row); }
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map((h) => h.trim());
  const rows = lines.slice(1).filter((l) => l.some((x) => x.trim() !== '')).map((l) => {
    const o: Record<string, unknown> = {};
    headers.forEach((h, i) => { o[h] = l[i] ?? null; });
    return o;
  });
  return { headers, rows };
}

const detectSeparator = (text: string) => {
  const sample = text.split(/\r?\n/, 5).join('\n');
  const counts = [',', ';', '\t', '|'].map((s) => ({ s, n: (sample.match(new RegExp(`\\${s}`, 'g')) || []).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].s : ',';
};

export function importCSV(text: string, opts: ImportOptions): ImportResult {
  const { headers, rows } = parseCSV(text);
  return importMarketData(headers, rows, { ...opts, source: opts.source ?? 'CSV' });
}

/** Parses the first worksheet of an .xlsx / .xls workbook. */
export function importXLSX(buffer: ArrayBuffer, opts: ImportOptions): ImportResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { raw: null, metadata: null, ok: false, report: {
    fileName: opts.fileName, rowsRead: 0, rowsAccepted: 0, rowsRejected: 0, columns: { date: '', close: '' },
    dateFormat: 'ISO', issues: [{ code: 'EMPTY_FILE', detail: 'Workbook has no sheets' }], tickers: [],
  }};
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (matrix.length === 0) return importMarketData([], [], { ...opts, source: opts.source ?? 'Excel' });
  const headers = (matrix[0] as unknown[]).map((h, i) => h == null ? `Column_${i + 1}` : String(h).trim());
  const rows = matrix.slice(1).map((row) => {
    const o: Record<string, unknown> = {};
    const arr = row as unknown[];
    headers.forEach((h, i) => { o[h] = arr[i] ?? null; });
    return o;
  }).filter((r) => Object.values(r).some((v) => v !== null && v !== ''));
  return importMarketData(headers, rows, { ...opts, source: opts.source ?? 'Excel' });
}
