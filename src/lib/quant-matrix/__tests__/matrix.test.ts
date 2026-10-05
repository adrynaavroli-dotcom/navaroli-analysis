import { describe, it, expect } from 'vitest';
import { allMatrixItems, quantitativeProjectMatrix, ROADMAP, CURRENT_PRIORITY, effectiveStatus, applyState } from '../index';

describe('quantitative project matrix integrity', () => {
  const ids = new Set(allMatrixItems.map((i) => i.id));
  it('has unique ids', () => expect(ids.size).toBe(allMatrixItems.length));
  it('has 40 core items', () => expect(quantitativeProjectMatrix.length).toBe(40));
  it('all dependencies resolve', () => {
    for (const i of allMatrixItems) for (const d of i.dependencies) expect(ids.has(d), `${i.id} → ${d}`).toBe(true);
  });
  it('priority list ids resolve', () => {
    for (const c of CURRENT_PRIORITY) for (const id of c.ids) expect(ids.has(id), id).toBe(true);
  });
  it('every item maps to a roadmap phase and has validation methods', () => {
    const phases = new Set(ROADMAP.map((p) => p.phase));
    for (const i of allMatrixItems) { expect(phases.has(i.phase)).toBe(true); expect(i.validation.length).toBeGreaterThan(0); }
  });
  it('nothing is COMPLETED without completed validation', () => {
    for (const i of allMatrixItems) expect(effectiveStatus(i, 'COMPLETED')).toBe(i.layers.validation === 'COMPLETED' ? 'COMPLETED' : 'VALIDATION');
  });
  it('overrides are applied but COMPLETED is guarded', () => {
    const out = applyState({ items: { 'VOL-001': { status: 'COMPLETED' } }, phases: {} });
    expect(out.find((i) => i.id === 'VOL-001')!.status).toBe('VALIDATION');
  });
});
