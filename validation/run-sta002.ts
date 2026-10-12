/** STA-002 time-series diagnostics validation vs statsmodels.  Run:  bun validation/run-sta002.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { runSta002, type Sta002Fixture } from '../src/lib/validation/suites/sta002';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/sta002-benchmark.json', 'utf8')) as Sta002Fixture;
const results = runSta002(fx, new Date().toISOString().slice(0, 10));
writeFileSync('src/lib/validation/evidence/sta002-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.validationType.padEnd(22)} ${r.testName.padEnd(78)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed)) process.exit(1);
