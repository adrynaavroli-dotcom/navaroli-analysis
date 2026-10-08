import { describe, it, expect } from 'vitest';
import { allMatrixItems, quantitativeProjectMatrix, ROADMAP, CURRENT_PRIORITY, effectiveStatus, applyState, byDocPath } from '../index';
import { statusFor, planFor } from '@/lib/validation';

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
    const out = applyState({ items: { 'VOL-003': { status: 'COMPLETED' } }, phases: {} });
    expect(out.find((i) => i.id === 'VOL-003')!.status).toBe('VALIDATION');
  });
  it('validation layer COMPLETED ⇔ recorded evidence closes the validation plan', () => {
    for (const i of allMatrixItems) {
      const closed = !!planFor(i.id) && statusFor(i.id) === 'COMPLETED';
      expect(i.layers.validation === 'COMPLETED', i.id).toBe(closed);
    }
  });
  it('Returns Engine is an explicit dependency of downstream quant models', () => {
    for (const id of ['VOL-001', 'VOL-002', 'VOL-003', 'COR-001', 'COR-002', 'POR-001', 'RSK-001', 'RSK-002', 'RSK-005'])
      expect(allMatrixItems.find((i) => i.id === id)!.dependencies, id).toContain('DAT-003');
  });
  it('doc paths resolve', () => {
    expect(byDocPath('/quant/data/returns')?.id).toBe('DAT-003');
    expect(byDocPath('/quant/volatility/ewma')?.id).toBe('VOL-002');
  });
});
