/**
 * POR-001 GMV validation: NumPy/SciPy benchmark (synthetic) + observed 4-asset walk-forward.
 * Run:  bun validation/run-por001.ts
 * Reads the APPROVED fixtures (never regenerates or modifies them) and writes run evidence only.
 * Evidence is written only when every check passes, so a failing run cannot bless new results.
 * The observed record is compared against the persisted evidence BEFORE overwriting it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runPor001, type Por001Fixture, POR001_IMPLEMENTATION_VERSION } from '../src/lib/validation/suites/por001';
import { runObservedWalkForward, type Por001Snapshot } from '../src/lib/portfolio/observed';
import { por001ObservedDifferences } from '../src/lib/validation/suites/por001-reproduction';
import type { ValidationResult } from '../src/lib/validation/types';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/por001-benchmark.json', 'utf8')) as Por001Fixture;
const snap = JSON.parse(readFileSync('src/lib/validation/fixtures/por001-snapshot.json', 'utf8')) as Por001Snapshot;
const date = new Date().toISOString().slice(0, 10);

const t0 = performance.now();
const results = runPor001(fx, date);
const observed = runObservedWalkForward(snap, POR001_IMPLEMENTATION_VERSION);
const ms = performance.now() - t0;

// Out-of-sample protocol checks on the observed record (descriptive evidence, no superiority claim).
const s = observed.outcome.summary;
const oos = (testName: string, passed: boolean, actual: string, expected: string, notes?: string): ValidationResult => ({
  modelId: 'POR-001', validationType: 'out-of-sample', testName, expectedResult: expected, actualResult: actual,
  tolerance: 'exact', maxAbsError: passed ? 0 : NaN, maxRelError: passed ? 0 : NaN, n: 1, passed,
  evidence: { reference: 'Walk-forward protocol (window 120, rebalance 21, no look-ahead)', dataset: `OBSERVED MARKET DATA — ${observed.snapshot.tickers.join('/')}, ${observed.snapshot.firstPriceDate}→${observed.snapshot.lastPriceDate}` },
  validationDate: date, implementationVersion: POR001_IMPLEMENTATION_VERSION, notes,
});
results.push(
  oos('Walk-forward executed on observed data with enough origins', s.origins >= observed.protocol.minOrigins, String(s.origins), `≥ ${observed.protocol.minOrigins}`),
  oos('All observed origins converged', s.failed === 0, `${s.converged}/${s.origins} converged`, '0 failed'),
  oos('Realized GMV and equal-weight volatilities are finite and positive',
    (s.gmvMeanRealizedVol ?? 0) > 0 && (s.ewMeanRealizedVol ?? 0) > 0,
    `GMV ${(s.gmvMeanRealizedVol! * 100).toFixed(2)}% vs EW ${(s.ewMeanRealizedVol! * 100).toFixed(2)}% (ratio ${s.volRatio!.toFixed(3)})`,
    'both > 0', 'Descriptive: no superiority claim; ratio reported as observed.'),
);

// Reproduction of the persisted observed record (compare BEFORE overwriting).
const OBSERVED_PATH = 'src/lib/validation/evidence/por001-observed.json';
let saved: unknown = null;
try { saved = JSON.parse(readFileSync(OBSERVED_PATH, 'utf8')); } catch { /* first run */ }
if (saved) {
  const differences = por001ObservedDifferences(observed, saved);
  results.push({
    modelId: 'POR-001', validationType: 'unit', testName: 'Complete observed record reproduces persisted evidence',
    expectedResult: 'no differences', actualResult: differences.length === 0 ? 'no differences' : `${differences.length} differences`,
    tolerance: 'exact', maxAbsError: differences.length === 0 ? 0 : NaN, maxRelError: differences.length === 0 ? 0 : NaN, n: 1, passed: differences.length === 0,
    evidence: { reference: 'Persisted por001-observed.json; only runtimeMs/evaluatedAt volatile', dataset: 'OBSERVED MARKET DATA — por001-snapshot.json' },
    validationDate: date, implementationVersion: POR001_IMPLEMENTATION_VERSION, notes: differences.length ? JSON.stringify(differences) : undefined,
  });
}

for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.validationType.padEnd(22)} ${r.testName.slice(0, 100).padEnd(100)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}${r.notes ? `  [${r.notes}]` : ''}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed · ${ms.toFixed(0)} ms`);
if (results.some((r) => !r.passed)) { console.error('Evidence NOT written (failing checks).'); process.exit(1); }
writeFileSync('src/lib/validation/evidence/por001-results.json', JSON.stringify(results, null, 1));
writeFileSync(OBSERVED_PATH, JSON.stringify(observed, null, 1));
