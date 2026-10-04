import { useMemo } from 'react';
import { usePageContent, useUpdatePageContent } from '@/hooks/usePageContent';
import { applyPhaseState, applyState, type MatrixState, type Status } from '@/lib/quant-matrix';

const KEY = 'quant_matrix_state';

export function useQuantMatrix() {
  const { data, isLoading } = usePageContent(KEY);
  const update = useUpdatePageContent();
  const state = (data?.content ?? { items: {}, phases: {} }) as unknown as MatrixState;

  const items = useMemo(() => applyState(state), [state]);
  const phases = useMemo(() => applyPhaseState(state), [state]);

  const save = (next: MatrixState) => update.mutateAsync({ pageKey: KEY, content: next as unknown as Record<string, unknown> });
  const setItemStatus = (id: string, status: Status) =>
    save({ ...state, items: { ...state.items, [id]: { ...state.items?.[id], status } } });
  const setPhaseStatus = (phase: number, status: Status) =>
    save({ ...state, phases: { ...state.phases, [phase]: status } });

  return { items, phases, isLoading, saving: update.isPending, setItemStatus, setPhaseStatus };
}
