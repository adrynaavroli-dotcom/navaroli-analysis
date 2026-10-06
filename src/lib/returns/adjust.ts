import type { PriceField, QualityFlag } from './types';

/** Minimum share of valid adjusted closes required to prefer adjclose. */
export const ADJCLOSE_MIN_COVERAGE = 0.95;

const valid = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Stage CLEANED → ADJUSTED (selection policy).
 * Yahoo `close` is split-adjusted only; `adjclose` is also dividend-adjusted.
 * Prefer adjclose (total-return series) when it is present and covers ≥95% of
 * the valid closes; otherwise fall back to close and raise UNADJUSTED_DIVIDENDS.
 * The selected raw vector is then passed through cleanPrices().
 */
export function selectPriceField(
  closes: (number | null | undefined)[],
  adjcloses?: (number | null | undefined)[],
): { field: PriceField; values: (number | null | undefined)[]; flags: QualityFlag[] } {
  if (adjcloses && adjcloses.length === closes.length) {
    const nClose = closes.filter(valid).length;
    const nAdj = adjcloses.filter(valid).length;
    if (nClose > 0 && nAdj / nClose >= ADJCLOSE_MIN_COVERAGE) return { field: 'adjclose', values: adjcloses, flags: [] };
  }
  return {
    field: 'close', values: closes,
    flags: [{ code: 'UNADJUSTED_DIVIDENDS', detail: 'Adjusted close unavailable; using split-adjusted close (dividends not reinvested)' }],
  };
}
