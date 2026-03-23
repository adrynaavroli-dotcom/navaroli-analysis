/**
 * Monte Carlo Option Pricing (European only)
 * Uses antithetic variates for variance reduction
 */

// Box-Muller transform for normal random numbers
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function mcEuropeanPrices(
  s: number, k: number, r: number, q: number,
  sigma: number, t: number, simulations: number = 25000
): { call: number; put: number } {
  const drift = (r - q - 0.5 * sigma * sigma) * t;
  const diffusion = sigma * Math.sqrt(t);
  const discount = Math.exp(-r * t);

  let callSum = 0;
  let putSum = 0;

  // Antithetic variates: use z and -z
  const halfSims = Math.floor(simulations / 2);

  for (let i = 0; i < halfSims; i++) {
    const z = gaussianRandom();

    const st1 = s * Math.exp(drift + diffusion * z);
    const st2 = s * Math.exp(drift + diffusion * (-z));

    callSum += Math.max(st1 - k, 0) + Math.max(st2 - k, 0);
    putSum += Math.max(k - st1, 0) + Math.max(k - st2, 0);
  }

  const totalSims = halfSims * 2;
  return {
    call: discount * (callSum / totalSims),
    put: discount * (putSum / totalSims),
  };
}
