/** VOL-003 GARCH(1,1) validation vs Python arch.  Run:  bun validation/run-vol003.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { runVol003, type Vol003Fixture } from '../src/lib/validation/suites/vol003';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/vol003-benchmark.json', 'utf8')) as Vol003Fixture;
const results = runVol003(fx, new Date().toISOString().slice(0, 10));
writeFileSync('src/lib/validation/evidence/vol003-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.validationType.padEnd(22)} ${r.testName.slice(0, 95).padEnd(95)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}${r.notes ? `  [${r.notes}]` : ''}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed)) process.exit(1);
