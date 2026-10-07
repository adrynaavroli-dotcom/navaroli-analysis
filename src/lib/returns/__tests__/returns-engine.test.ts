import { describe, it, expect } from 'vitest';
import {
  cleanPrices, flagAnomalies, selectPriceField, logReturns, simpleReturns, logToSimple, simpleToLog,
  resamplePrices, isoWeekKey, alignPrices, panelReturns, rollingApply, buildReturnsDataset, type DatasetMetadata,
} from '../index';

const meta: DatasetMetadata = { source: 'CSV', ticker: 'T', currency: 'EUR', frequency: 'daily', history: 'test', updateMethod: 'test', retrievedAt: '2026-01-01T00:00:00Z' };

describe('data cleaning', () => {
  it('duplicated dates: first occurrence kept', () => {
    const { series, report } = cleanPrices(['2024-01-01', '2024-01-01', '2024-01-02'], [1, 9, 2]);
    expect(series.prices).toEqual([1, 2]); expect(report.removedDuplicateDates).toBe(1);
  });
  it('unordered dates are sorted and flagged', () => {
    const { series, report, flags } = cleanPrices(['2024-01-03', '2024-01-01', '2024-01-02'], [3, 1, 2]);
    expect(series.dates).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    expect(report.reordered).toBe(true); expect(flags.some((f) => f.code === 'OUT_OF_ORDER')).toBe(true);
  });
  it('null / NaN / undefined prices removed, not filled', () => {
    const { series, report } = cleanPrices(['a', 'b', 'c', 'd'], [1, null, NaN, undefined]);
    expect(series.prices).toEqual([1]); expect(report.removedMissing).toBe(3);
  });
  it('prices <= 0 removed', () => {
    const { report } = cleanPrices(['a', 'b', 'c'], [0, -1, 5]);
    expect(report.removedNonPositive).toBe(2); expect(report.kept).toBe(1);
  });
  it('empty dataset', () => {
    const { series, report } = cleanPrices([], []);
    expect(series.prices).toEqual([]); expect(report.kept).toBe(0);
    expect(logReturns(series).returns).toEqual([]);
  });
  it('insufficient observations: 1 price → 0 returns', () => {
    expect(logReturns({ dates: ['a'], prices: [1] }).returns).toEqual([]);
    expect(buildReturnsDataset({ dates: ['2024-01-01'], closes: [1] }, meta).returns.returns).toEqual([]);
  });
});

describe('returns', () => {
  const s = { dates: ['d0', 'd1', 'd2'], prices: [100, 105, 102] };
  it('simple and log', () => {
    expect(simpleReturns(s).returns[0]).toBeCloseTo(0.05, 15);
    expect(logReturns(s).returns[1]).toBeCloseTo(Math.log(102 / 105), 15);
  });
  it('first observation has no return; dates are end dates', () => {
    expect(logReturns(s).dates).toEqual(['d1', 'd2']);
  });
  it('consecutive log returns add up to the total log return', () => {
    const r = logReturns(s).returns;
    expect(r[0] + r[1]).toBeCloseTo(Math.log(102 / 100), 15);
  });
  it('R = e^r − 1 and r = ln(1+R)', () => {
    simpleReturns(s).returns.forEach((R, i) => {
      expect(logToSimple(logReturns(s).returns[i])).toBeCloseTo(R, 15);
      expect(simpleToLog(R)).toBeCloseTo(logReturns(s).returns[i], 15);
    });
  });
});

describe('frequency', () => {
  const days = ['2024-01-29', '2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02', '2024-02-05'];
  const s = { dates: days, prices: [1, 2, 3, 4, 5, 6] };
  it('ISO weeks (Mon–Sun), including year boundary', () => {
    expect(isoWeekKey('2024-01-29')).toBe('2024-W05');
    expect(isoWeekKey('2021-01-03')).toBe('2020-W53');
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
  });
  it('weekly: last price of each week, dated at last trading day', () => {
    expect(resamplePrices(s, 'weekly')).toEqual({ dates: ['2024-02-02', '2024-02-05'], prices: [5, 6] });
  });
  it('monthly: period-end price selection', () => {
    expect(resamplePrices(s, 'monthly')).toEqual({ dates: ['2024-01-31', '2024-02-05'], prices: [3, 6] });
  });
});

describe('multi-asset alignment', () => {
  const A = { dates: ['d1', 'd2', 'd3', 'd4'], prices: [1, 2, 3, 4] };
  const B = { dates: ['d2', 'd4', 'd5'], prices: [20, 40, 50] };
  it('keeps only common dates, no forward fill', () => {
    const p = alignPrices({ A, B });
    expect(p.dates).toEqual(['d2', 'd4']); expect(p.values).toEqual([[2, 20], [4, 40]]);
    expect(p.dropped).toEqual({ A: 2, B: 1 });
  });
  it('different histories and deterministic output', () => {
    expect(alignPrices({ A, B })).toEqual(alignPrices({ A, B }));
    expect(alignPrices({ A: { dates: ['x'], prices: [1] }, B }).dates).toEqual([]);
  });
  it('panel returns', () => {
    const r = panelReturns(alignPrices({ A, B }), 'simple');
    expect(r.dates).toEqual(['d4']); expect(r.values[0][0]).toBeCloseTo(1, 15); expect(r.values[0][1]).toBeCloseTo(1, 15);
  });
});

describe('quality flags', () => {
  it('large jumps, repeated prices, calendar gaps', () => {
    const f = flagAnomalies({ dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-20'], prices: [10, 20, 20, 20, 20, 20, 21] });
    const codes = f.map((x) => x.code);
    expect(codes).toContain('LARGE_MOVE'); expect(codes).toContain('STALE_PRICE'); expect(codes).toContain('CALENDAR_GAP');
  });
  it('flags never change data', () => {
    const s = { dates: ['2024-01-01', '2024-01-02'], prices: [1, 3] };
    flagAnomalies(s); expect(s.prices).toEqual([1, 3]);
  });
  it('adjusted-price selection and warning', () => {
    expect(selectPriceField([1, 2], [0.9, 1.9]).field).toBe('adjclose');
    const fb = selectPriceField([1, 2]);
    expect(fb.field).toBe('close'); expect(fb.flags[0].code).toBe('UNADJUSTED_DIVIDENDS');
    expect(selectPriceField([1, 2, 3, 4], [1, null, null, 4]).field).toBe('close');
  });
  it('rolling helper is trailing', () => {
    expect(rollingApply([1, 2, 3], 2, (w) => w.reduce((a, b) => a + b))).toEqual([null, 3, 5]);
  });
  it('pipeline keeps stages and metadata', () => {
    const d = buildReturnsDataset({ dates: ['2024-01-02', '2024-01-01', '2024-01-03'], closes: [2, 1, 4], adjcloses: [2, 1, 4] }, meta, 'simple');
    expect(d.metadata.priceField).toBe('adjclose'); expect(d.metadata.observations).toBe(3);
    expect(d.raw.closes).toEqual([2, 1, 4]); expect(d.returns.returns).toEqual([1, 1]);
    expect(d.flags.some((f) => f.code === 'OUT_OF_ORDER')).toBe(true);
  });
});
