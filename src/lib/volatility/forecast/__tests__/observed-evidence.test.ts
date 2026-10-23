import { describe, expect, it } from 'vitest';
import snapshot from '../../../validation/fixtures/dat001-snapshot.json';
import observed from '../../../validation/evidence/vol005-observed.json';
import { runObservedEvaluation, type Dat001Snapshot } from '../../../validation/suites/vol005';
import { validationStatusFor } from '../../../validation/registry';
import { observedRecordDifferences } from '../../../validation/suites/vol005-reproduction';

describe('VOL-005 persisted observed evidence', () => {
  it('re-running AAPL preserves the complete record within named cross-runtime GARCH tolerances', () => {
    const fresh = runObservedEvaluation(snapshot as unknown as Dat001Snapshot);
    const differences = observedRecordDifferences(fresh, observed);
    expect(differences, JSON.stringify(differences, null, 2)).toEqual([]);
    const repeated = runObservedEvaluation(snapshot as unknown as Dat001Snapshot);
    // Within the same runtime substantive results remain bit-identical.
    const { runtimeMs: _ms1, evaluatedAt: _at1, ...first } = fresh;
    const { runtimeMs: _ms2, evaluatedAt: _at2, ...second } = repeated;
    expect(second).toEqual(first);
  });
  it('ignores only named run metadata and rejects substantive mutations with JSON paths', () => {
    expect(observedRecordDifferences({ ...observed, runtimeMs: 0, evaluatedAt: 'other' }, observed)).toEqual([]);
    for (const mutate of [
      (r: typeof observed) => { r.protocol.refitEvery = 21; },
      (r: typeof observed) => { r.snapshot.priceBasis = 'close'; },
      (r: typeof observed) => { r.outcome.horizons[0].origins--; },
      (r: typeof observed) => { r.outcome.horizons[0].scores.garch.qlike += 1e-6; },
      (r: typeof observed) => { r.outcome.refitOrigins[0].success = false; },
      (r: typeof observed) => { r.outcome.horizons[0].excludedOrigins++; },
    ]) {
      const changed = structuredClone(observed); mutate(changed);
      const differences = observedRecordDifferences(changed, observed);
      expect(differences).toHaveLength(1);
      expect(differences[0].path).toMatch(/^\$\.(protocol|snapshot|outcome)\./);
      expect(differences[0].actual).not.toEqual(differences[0].expected);
    }
  });
  it('protocol on the snapshot: n=700, train=420, 261 origins at H=20, refit every 20', () => {
    const o = observed.outcome as { trainSize: number; refitEvery: number; horizons: { horizon: number; origins: number }[] };
    expect(observed.returns.n).toBe(700);
    expect(o.trainSize).toBe(420);
    expect(o.refitEvery).toBe(20);
    expect(o.horizons.map(h => h.origins)).toEqual([280, 276, 271, 261]);
  });
  it('validation layer is closed by recorded evidence', () => {
    expect(validationStatusFor('VOL-005')).toBe('COMPLETED');
  });
});
