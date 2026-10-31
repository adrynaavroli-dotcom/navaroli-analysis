/**
 * POR-001 GMV validation vs Python NumPy/SciPy.  Run:  bun validation/run-por001.ts
 * Reads the APPROVED fixture (never regenerates or modifies it) and writes run evidence only.
 * Evidence is written only when every check passes, so a failing run cannot bless new results.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runPor001, type Por001Fixture } from '../src/lib/validation/suites/por001';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/por001-benchmark.json', 'utf8')) as Por001Fixture;
const t0 = performance.now();
const results = runPor001(fx, new Date().toISOString().slice(0, 10));
const ms = performance.now() - t0;
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.validationType.padEnd(22)} ${r.testName.slice(0, 100).padEnd(100)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}${r.notes ? `  [${r.notes}]` : ''}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed · ${ms.toFixed(0)} ms`);
if (results.some((r) => !r.passed)) { console.error('Evidence NOT written (failing checks).'); process.exit(1); }
writeFileSync('src/lib/validation/evidence/por001-results.json', JSON.stringify(results, null, 1));
