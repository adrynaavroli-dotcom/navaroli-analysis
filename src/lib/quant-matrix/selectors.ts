import { allMatrixItems } from './data';
import { ROADMAP } from './roadmap';
import { SOURCE_TO_VERIFY, type MatrixItem, type MatrixState, type RoadmapPhase, type Status } from './types';

/**
 * A model may only be COMPLETED when it has validation methods AND its
 * validation layer is COMPLETED. Otherwise it is downgraded to VALIDATION.
 */
export function effectiveStatus(item: MatrixItem, requested: Status = item.status): Status {
  if (requested !== 'COMPLETED') return requested;
  return item.validation.length > 0 && item.layers.validation === 'COMPLETED' ? 'COMPLETED' : 'VALIDATION';
}

export function applyState(state: MatrixState | null | undefined, items = allMatrixItems): MatrixItem[] {
  return items.map((i) => {
    const o = state?.items?.[i.id];
    return { ...i, status: effectiveStatus(i, o?.status ?? i.status), nextAction: o?.nextAction ?? i.nextAction };
  });
}

export function applyPhaseState(state: MatrixState | null | undefined, phases = ROADMAP): RoadmapPhase[] {
  return phases.map((p) => ({ ...p, status: state?.phases?.[p.phase] ?? p.status }));
}

export const byId = (items: MatrixItem[]) => new Map(items.map((i) => [i.id, i]));

/** Items that list `id` as a dependency. */
export const dependents = (items: MatrixItem[], id: string) => items.filter((i) => i.dependencies.includes(id));

export const countBy = <K extends string>(items: MatrixItem[], key: (i: MatrixItem) => K | K[]) => {
  const out = {} as Record<K, number>;
  for (const i of items) for (const k of ([] as K[]).concat(key(i))) out[k] = (out[k] ?? 0) + 1;
  return out;
};

/** Fraction of layer-steps completed across items (layers weighted equally). */
export function layerProgress(items: MatrixItem[]): number {
  if (!items.length) return 0;
  const values = items.flatMap((i) => Object.values(i.layers));
  return values.filter((v) => v === 'COMPLETED').length / values.length;
}

export const needsValidation = (i: MatrixItem) => i.layers.code !== 'NOT STARTED' && i.layers.validation !== 'COMPLETED';
export const withoutData = (i: MatrixItem) => i.requiredData.length === 0 || i.requiredData.every((d) => d.source === 'Derived' && i.dependencies.length === 0);
export const withoutDocs = (i: MatrixItem) => i.layers.code !== 'NOT STARTED' && i.layers.documentation !== 'COMPLETED';
export const sourceUnverified = (i: MatrixItem) => i.master.source === SOURCE_TO_VERIFY;

/** Technical documentation routing (/quant/...): exact item, or items under a section prefix. */
export const byDocPath = (path: string, items = allMatrixItems) => items.find((i) => i.docPath === path);
export const underDocPath = (path: string, items = allMatrixItems) => items.filter((i) => i.docPath.startsWith(`${path.replace(/\/$/, '')}/`));
