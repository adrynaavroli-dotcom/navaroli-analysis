/** Covariance & correlation validation vs Python.  Run:  bun validation/run-phase4.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { runPhase4, type Phase4Fixture } from '../src/lib/validation/suites/phase4';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/phase4-benchmark.json', 'utf8')) as Phase4Fixture;
const results = runPhase4(fx, new Date().toISOString().slice(0, 10));
writeFileSync('src/lib/validation/evidence/phase4-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.modelId}  ${r.validationType.padEnd(22)} ${r.testName.padEnd(70)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed)) process.exit(1);
