/**
 * Loads the DAT-001 snapshot (Yahoo vs Nasdaq AAPL split-adjusted closes) and
 * writes the comparison evidence shown in the Quant Matrix.
 *
 *   python validation/python/benchmark_dat001.py   # (re)generate the snapshot
 *   bun validation/run-dat001.ts                   # (re)run the comparison
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runDat001, type Dat001Snapshot } from '../src/lib/validation/suites/dat001';

const snapshot = JSON.parse(readFileSync('src/lib/validation/fixtures/dat001-snapshot.json', 'utf8')) as Dat001Snapshot;
const date = new Date().toISOString().slice(0, 10);
const results = runDat001(snapshot, date);
writeFileSync('src/lib/validation/evidence/dat001-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.modelId}  ${r.testName.padEnd(70)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed)) process.exit(1);
