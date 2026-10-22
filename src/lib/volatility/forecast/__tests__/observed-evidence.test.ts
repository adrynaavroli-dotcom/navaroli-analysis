import { describe, expect, it } from 'vitest';
import snapshot from '../../../validation/fixtures/dat001-snapshot.json';
import observed from '../../../validation/evidence/vol005-observed.json';
import { runObservedEvaluation, type Dat001Snapshot } from '../../../validation/suites/vol005';
import { validationStatusFor } from '../../../validation/registry';

describe('VOL-005 persisted observed evidence', () => {
  it('re-running the observed AAPL evaluation reproduces the persisted scores exactly', () => {
    const fresh = runObservedEvaluation(snapshot as unknown as Dat001Snapshot);
    expect(fresh.outcome).toEqual(observed.outcome);
    expect(fresh.returns).toEqual(observed.returns);
    expect(fresh.snapshot).toEqual(observed.snapshot);
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
