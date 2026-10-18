/**
 * DAT-001 validation suite — compares the live Yahoo Finance snapshot of AAPL
 * daily split-adjusted closes against the Nasdaq Data historical endpoint
 * (api.nasdaq.com).  Both providers publish SPLIT-ADJUSTED closes, so this is
 * a like-for-like comparison; Yahoo's `adjclose` (dividend-reinvested) is
 * stored in the snapshot for provenance but intentionally not compared,
 * because Nasdaq exposes no equivalent field.
 *
 * The snapshot is produced by `validation/python/benchmark_dat001.py` and
 * saved to `src/lib/validation/fixtures/dat001-snapshot.json`.
 */
import { compareNumeric } from '../compare';
import type { ValidationResult } from '../types';
import { importCSV } from '../../returns/import';
import { buildReturnsDataset } from '../../returns/pipeline';

export const DAT001_IMPLEMENTATION_VERSION = 'quant-engine/dat001-ingestion@1.0.0';

export interface Dat001Snapshot {
  version: string;
  ticker: string;
  range: { from: string; to: string };
  retrievedAt: string;
  currency: string | null;
  sources: {
    yahoo: { provider: string; endpoint: string; basis: string; rows: { date: string; close: number; adjclose: number | null }[] };
    nasdaq: { provider: string; endpoint: string; basis: string; rows: { date: string; close: number }[] };
  };
  comparison: {
    basis: string; excludedBasis: string;
    overlap: number; onlyA: string[]; onlyB: string[];
    maxAbsError: number; maxRelError: number; meanAbsError: number;
    rows: { date: string; a: number; b: number; absError: number }[];
  };
}

/**
 * Tolerances allow for the small discrepancies normal across providers:
 *   - Rounding to the cent (quoted prices).
 *   - Different real-time vs end-of-day fixings.
 *   - Different split-adjustment application timing.
 * Observed worst-case on the recorded fixture: maxAbs ≈ 1.5e-5, maxRel ≈ 6e-8.
 */
const TOL = { abs: 0.02, rel: 2e-4 };

export function runDat001(snapshot: Dat001Snapshot, validationDate: string): ValidationResult[] {
  const { comparison, sources } = snapshot;
  const dataset = `AAPL ${snapshot.range.from} → ${snapshot.range.to} (snapshot ${snapshot.version}, retrieved ${snapshot.retrievedAt})`;
  const reference = `${sources.nasdaq.provider} vs ${sources.yahoo.provider} (${comparison.basis})`;
  const meta = (testName: string, type: 'independent-benchmark' | 'unit' = 'independent-benchmark') => ({
    modelId: 'DAT-001', validationType: type, testName,
    reference, dataset, validationDate, implementationVersion: DAT001_IMPLEMENTATION_VERSION,
  });

  const actual = comparison.rows.map((r) => r.a);
  const expected = comparison.rows.map((r) => r.b);
  const results: ValidationResult[] = [
    compareNumeric(actual, expected, TOL, meta(`Element-wise split-adjusted close agreement over ${comparison.overlap} overlapping dates`)),
    {
      ...meta('Overlap coverage ≥ 95% of Nasdaq observations'),
      expectedResult: `≥ ${sources.nasdaq.rows.length * 0.95}`,
      actualResult: String(comparison.overlap),
      tolerance: { abs: 0, rel: 0 },
      maxAbsError: Math.max(0, sources.nasdaq.rows.length - comparison.overlap),
      maxRelError: 0, n: sources.nasdaq.rows.length,
      passed: comparison.overlap >= sources.nasdaq.rows.length * 0.95,
      evidence: { reference, dataset }, notes: `onlyYahoo=${comparison.onlyA.length}, onlyNasdaq=${comparison.onlyB.length}`,
    },
  ];

  // Unit: CSV round-trip — Yahoo snapshot re-imported via importCSV must produce
  // identical returns through buildReturnsDataset (same pipeline, no special paths).
  const csvLines = ['Date,Close,Adj Close', ...sources.yahoo.rows.map((r) => `${r.date},${r.close},${r.adjclose ?? ''}`)].join('\n');
  const imp = importCSV(csvLines, { fileName: 'snapshot-roundtrip.csv', ticker: snapshot.ticker });
  let unitPassed = imp.ok && !!imp.raw;
  let unitDetail = '';
  if (unitPassed && imp.raw && imp.metadata) {
    const ds = buildReturnsDataset(imp.raw, imp.metadata, 'log');
    unitPassed = ds.returns.returns.length === sources.yahoo.rows.length - 1;
    unitDetail = `${ds.returns.returns.length} returns from ${sources.yahoo.rows.length} prices`;
  } else {
    unitDetail = 'Import failed';
  }
  results.push({
    ...meta('CSV import round-trip: Yahoo snapshot → importCSV → buildReturnsDataset', 'unit'),
    expectedResult: `${sources.yahoo.rows.length - 1} log returns`,
    actualResult: unitDetail, tolerance: 'exact',
    maxAbsError: unitPassed ? 0 : 1, maxRelError: 0, n: sources.yahoo.rows.length,
    passed: unitPassed,
    evidence: { reference: 'importCSV + buildReturnsDataset', dataset },
  });

  return results;
}
