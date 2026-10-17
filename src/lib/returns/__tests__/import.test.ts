import { describe, it, expect } from 'vitest';
import { importCSV, importMarketData, parseCellDate, parseCellNumber } from '../import';
import { buildReturnsDataset } from '../pipeline';

const CSV = `Date,Close,Adj Close,Ticker
2024-01-02,185.64,184.80,AAPL
2024-01-03,184.25,183.42,AAPL
2024-01-04,181.91,181.10,AAPL
2024-01-05,181.18,180.37,AAPL
`;

describe('CSV / Excel importer', () => {
  it('loads a well-formed CSV and preserves adjclose + ticker', () => {
    const r = importCSV(CSV, { fileName: 'aapl.csv' });
    expect(r.ok).toBe(true);
    expect(r.raw!.dates).toEqual(['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']);
    expect(r.raw!.closes).toEqual([185.64, 184.25, 181.91, 181.18]);
    expect(r.raw!.adjcloses).toEqual([184.8, 183.42, 181.1, 180.37]);
    expect(r.metadata!.ticker).toBe('AAPL');
    expect(r.report.rowsAccepted).toBe(4);
    expect(r.report.rowsRejected).toBe(0);
  });

  it('plugs into buildReturnsDataset without special-case logic', () => {
    const r = importCSV(CSV, { fileName: 'aapl.csv' });
    const ds = buildReturnsDataset(r.raw!, r.metadata!, 'log');
    expect(ds.metadata.priceField).toBe('adjclose');
    expect(ds.returns.returns.length).toBe(3);
    expect(ds.returns.returns[0]).toBeCloseTo(Math.log(183.42 / 184.80), 12);
  });

  it('rejects missing date or price column, preserves no raw dataset', () => {
    const r = importCSV('x,y\n1,2\n', { fileName: 'bad.csv' });
    expect(r.ok).toBe(false);
    expect(r.raw).toBeNull();
    expect(r.report.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['MISSING_DATE_COLUMN', 'MISSING_PRICE_COLUMN']));
  });

  it('reports invalid dates, duplicates, non-positive and non-numeric prices without silent fixes', () => {
    const txt = `Date,Close
2024-01-02,100
2024-01-02,101
not-a-date,102
2024-01-03,-5
2024-01-04,abc
2024-01-05,105
`;
    const r = importCSV(txt, { fileName: 'dirty.csv' });
    expect(r.ok).toBe(true);
    expect(r.raw!.dates).toEqual(['2024-01-02', '2024-01-05']);
    const codes = r.report.issues.map((i) => i.code).sort();
    expect(codes).toEqual(expect.arrayContaining(['DUPLICATE_DATE', 'INVALID_DATE', 'NON_POSITIVE_PRICE', 'INVALID_NUMBER']));
    expect(r.report.rowsRejected).toBe(4);
  });

  it('sorts out-of-order rows and flags them (never silently)', () => {
    const txt = `Date,Close\n2024-01-03,3\n2024-01-01,1\n2024-01-02,2\n`;
    const r = importCSV(txt, { fileName: 'o.csv' });
    expect(r.raw!.dates).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    expect(r.report.issues.some((i) => i.code === 'OUT_OF_ORDER')).toBe(true);
  });

  it('flags ambiguous DMY/MDY and never guesses', () => {
    expect(parseCellDate('05/06/2024').ambiguous).toBe(true);
    expect(parseCellDate('31/01/2024').iso).toBe('2024-01-31');
    expect(parseCellDate('01/31/2024').iso).toBe('2024-01-31');
    expect(parseCellDate('2024-02-30').iso).toBeNull();
  });

  it('parses Excel serial dates and locale numbers', () => {
    expect(parseCellDate(45293).iso).toBe('2024-01-02'); // Excel epoch
    expect(parseCellNumber('1.234,56')).toBeCloseTo(1234.56, 10);
    expect(parseCellNumber('$1,234.56')).toBeCloseTo(1234.56, 10);
    expect(parseCellNumber('(50)')).toBe(-50);
    expect(parseCellNumber('')).toBeNull();
  });

  it('rejects files containing multiple tickers (one instrument per file)', () => {
    const txt = `Date,Close,Ticker\n2024-01-02,1,AAPL\n2024-01-03,2,MSFT\n`;
    const r = importCSV(txt, { fileName: 'mix.csv' });
    expect(r.ok).toBe(false);
    expect(r.report.issues.some((i) => i.code === 'MULTIPLE_TICKERS')).toBe(true);
  });

  it('preserves close vs adjclose distinction', () => {
    const txt = `Date,Close\n2024-01-02,100\n2024-01-03,101\n`;
    const r = importCSV(txt, { fileName: 'c.csv', ticker: 'X' });
    const ds = buildReturnsDataset(r.raw!, r.metadata!, 'log');
    expect(ds.metadata.priceField).toBe('close');
    expect(ds.flags.some((f) => f.code === 'UNADJUSTED_DIVIDENDS')).toBe(true);
  });

  it('empty file is reported, no dataset produced', () => {
    const r = importMarketData(['Date', 'Close'], [], { fileName: 'empty.csv' });
    expect(r.ok).toBe(false);
    expect(r.report.issues.some((i) => i.code === 'EMPTY_FILE')).toBe(true);
  });

  it('accepts European separator and header aliases', () => {
    const txt = `Fecha;Precio\n2024-01-02;100,50\n2024-01-03;101,25\n`;
    const r = importCSV(txt, { fileName: 'eu.csv', ticker: 'EU' });
    expect(r.ok).toBe(true);
    expect(r.raw!.closes).toEqual([100.5, 101.25]);
  });
});
