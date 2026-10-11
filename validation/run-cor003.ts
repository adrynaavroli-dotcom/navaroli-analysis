/** COR-003 EWMA covariance validation vs Python.  Run:  bun validation/run-cor003.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { runCor003, type Cor003Fixture } from '../src/lib/validation/suites/cor003';
import type { Phase4Fixture } from '../src/lib/validation/suites/phase4';

const p4 = JSON.parse(readFileSync('src/lib/validation/fixtures/phase4-benchmark.json', 'utf8')) as Phase4Fixture;
const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/cor003-benchmark.json', 'utf8')) as Cor003Fixture;
const results = runCor003(p4, fx, new Date().toISOString().slice(0, 10));
writeFileSync('src/lib/validation/evidence/cor003-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.validationType.padEnd(22)} ${r.testName.padEnd(80)} maxAbs=${r.maxAbsError.toExponential(2)}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed)) process.exit(1);
