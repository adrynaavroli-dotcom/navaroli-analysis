/**
 * Runs Web engine vs Python reference and writes the evidence file shown in the
 * Quant Matrix detail sheet.  Run:  bun validation/run-phase1.ts
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { runPhase1Benchmark, type Phase1Fixture } from '../src/lib/validation/suites/phase1';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/phase1-benchmark.json', 'utf8')) as Phase1Fixture;
const results = runPhase1Benchmark(fx, new Date().toISOString().slice(0, 10));
writeFileSync('src/lib/validation/evidence/phase1-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.modelId}  ${r.testName.padEnd(48)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
