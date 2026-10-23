/** VOL-005 forecast evaluation: arch benchmark (synthetic) + observed AAPL OOS run.  Run: bun validation/run-vol005.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { runObservedEvaluation, runVol005, type Dat001Snapshot, type Vol005Fixture } from '../src/lib/validation/suites/vol005';
import { observedRecordDifferences } from '../src/lib/validation/suites/vol005-reproduction';
import { compareExact } from '../src/lib/validation/compare';

const fx = JSON.parse(readFileSync('src/lib/validation/fixtures/vol005-benchmark.json', 'utf8')) as Vol005Fixture;
const snap = JSON.parse(readFileSync('src/lib/validation/fixtures/dat001-snapshot.json', 'utf8')) as Dat001Snapshot;
const observed = runObservedEvaluation(snap);
const results = runVol005(fx, observed, new Date().toISOString().slice(0, 10));
const saved = JSON.parse(readFileSync('src/lib/validation/evidence/vol005-observed.json', 'utf8'));
const differences = observedRecordDifferences(observed, saved);
results.push(compareExact([differences.length], [0], {
  modelId: 'VOL-005', validationType: 'unit', testName: 'Complete observed record reproduces persisted evidence',
  reference: 'Persisted vol005-observed.json; only runtimeMs/evaluatedAt volatile, named GARCH cross-runtime score tolerances',
  dataset: `OBSERVED DAT-001 AAPL ${snap.version}`, validationDate: new Date().toISOString().slice(0, 10),
  implementationVersion: observed.implementationVersion, notes: JSON.stringify(differences),
}));
// Do not overwrite a failing reference and thereby bless changed substantive results.
if (differences.length === 0) writeFileSync('src/lib/validation/evidence/vol005-observed.json', JSON.stringify(observed, null, 1));
writeFileSync('src/lib/validation/evidence/vol005-results.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.validationType.padEnd(22)} ${r.testName.slice(0, 110).padEnd(110)} maxAbs=${r.maxAbsError.toExponential(2)} maxRel=${r.maxRelError.toExponential(2)}${r.notes ? `\n      ${r.notes}` : ''}`);
console.log(`observed runtime ${observed.runtimeMs} ms; returns n=${observed.returns.n}; train=${observed.protocol.trainSize}`);
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed)) process.exit(1);
