/**
 * Runs the Phase 1 validation (numerical + Web engine vs Python reference) and
 * writes the evidence shown in the Quant Matrix.  Run:  bun validation/run-phase1.ts
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { runPhase1Benchmark, type Phase1Fixture } from '../src/lib/validation/suites/phase1';
import { runPhase1Numerical } from '../src/lib/validation/suites/phase1-numerical';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/phase1-benchmark.json', 'utf8')) as Phase1Fixture;
const date = new Date().toISOString().slice(0, 10);
const results = [...runPhase1Numerical(date, fx.returns.log, fx.returns.simple), ...runPhase1Benchmark(fx, date)];
writeFileSync('src/lib/validation/evidence/phase1-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.modelId}  ${r.validationType.padEnd(22)} ${r.testName.padEnd(58)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed)) process.exit(1);
