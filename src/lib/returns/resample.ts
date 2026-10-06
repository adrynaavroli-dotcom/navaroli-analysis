import type { Frequency, PriceSeries } from './types';

/** ISO-week key (Mon–Sun weeks) for a YYYY-MM-DD date, using UTC. */
export function isoWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of the week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const periodKey = (date: string, f: Frequency) => (f === 'monthly' ? date.slice(0, 7) : f === 'weekly' ? isoWeekKey(date) : date);

/**
 * Resample prices to a lower frequency using the LAST observation of each
 * period (date = last trading date in the period). Returns must be computed
 * AFTER resampling prices, never by averaging daily returns.
 */
export function resamplePrices(s: PriceSeries, f: Frequency): PriceSeries {
  if (f === 'daily') return { dates: [...s.dates], prices: [...s.prices] };
  const dates: string[] = []; const prices: number[] = [];
  for (let i = 0; i < s.dates.length; i++) {
    const k = periodKey(s.dates[i], f);
    if (i + 1 === s.dates.length || periodKey(s.dates[i + 1], f) !== k) { dates.push(s.dates[i]); prices.push(s.prices[i]); }
  }
  return { dates, prices };
}
