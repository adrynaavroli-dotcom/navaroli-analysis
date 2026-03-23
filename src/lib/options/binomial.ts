/**
 * Binomial CRR Option Pricing Model
 * Ported from Python: pricer/binomial.py
 */

export function binomialOptionPrices(
  s: number, k: number, r: number, q: number,
  sigma: number, t: number, steps: number = 500, american: boolean = true
): { call: number; put: number } {
  if (s <= 0 || k <= 0) throw new Error('S and K must be > 0');
  if (sigma <= 0) throw new Error('Volatility must be > 0');
  if (t <= 0) throw new Error('Time to expiry must be > 0');
  if (steps <= 0) throw new Error('Steps must be > 0');

  const dt = t / steps;
  const up = Math.exp(sigma * Math.sqrt(dt));
  const down = 1.0 / up;
  const growth = Math.exp((r - q) * dt);
  const probability = (growth - down) / (up - down);

  if (probability <= 0 || probability >= 1) throw new Error('Invalid parameters for binomial tree');

  const discount = Math.exp(-r * dt);
  const callValues = new Float64Array(steps + 1);
  const putValues = new Float64Array(steps + 1);

  for (let i = 0; i <= steps; i++) {
    const terminalPrice = s * Math.pow(up, steps - i) * Math.pow(down, i);
    callValues[i] = Math.max(terminalPrice - k, 0);
    putValues[i] = Math.max(k - terminalPrice, 0);
  }

  for (let step = steps - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const contCall = discount * (probability * callValues[i] + (1 - probability) * callValues[i + 1]);
      const contPut = discount * (probability * putValues[i] + (1 - probability) * putValues[i + 1]);

      if (american) {
        const spot = s * Math.pow(up, step - i) * Math.pow(down, i);
        callValues[i] = Math.max(contCall, Math.max(spot - k, 0));
        putValues[i] = Math.max(contPut, Math.max(k - spot, 0));
      } else {
        callValues[i] = contCall;
        putValues[i] = contPut;
      }
    }
  }

  return { call: callValues[0], put: putValues[0] };
}

export interface TreeNode {
  spot: number;
  call: number;
  put: number;
}

export function buildTreeLevels(
  s: number, k: number, r: number, q: number,
  sigma: number, t: number, steps: number = 6, american: boolean = true
): TreeNode[][] {
  if (s <= 0 || k <= 0) throw new Error('S and K must be > 0');
  if (sigma <= 0) throw new Error('Volatility must be > 0');
  if (t <= 0) throw new Error('Time to expiry must be > 0');

  const dt = t / steps;
  const up = Math.exp(sigma * Math.sqrt(dt));
  const down = 1.0 / up;
  const growth = Math.exp((r - q) * dt);
  const probability = (growth - down) / (up - down);
  const discount = Math.exp(-r * dt);

  // Build stock price levels
  const stockLevels: number[][] = [];
  for (let step = 0; step <= steps; step++) {
    const level: number[] = [];
    for (let i = 0; i <= step; i++) {
      level.push(s * Math.pow(up, step - i) * Math.pow(down, i));
    }
    stockLevels.push(level);
  }

  // Initialize option values at expiry
  const callLevels: number[][] = stockLevels.map(l => new Array(l.length).fill(0));
  const putLevels: number[][] = stockLevels.map(l => new Array(l.length).fill(0));

  const lastLevel = stockLevels[steps];
  for (let i = 0; i < lastLevel.length; i++) {
    callLevels[steps][i] = Math.max(lastLevel[i] - k, 0);
    putLevels[steps][i] = Math.max(k - lastLevel[i], 0);
  }

  // Backward induction
  for (let step = steps - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const contCall = discount * (probability * callLevels[step + 1][i] + (1 - probability) * callLevels[step + 1][i + 1]);
      const contPut = discount * (probability * putLevels[step + 1][i] + (1 - probability) * putLevels[step + 1][i + 1]);

      if (american) {
        const spot = stockLevels[step][i];
        callLevels[step][i] = Math.max(contCall, Math.max(spot - k, 0));
        putLevels[step][i] = Math.max(contPut, Math.max(k - spot, 0));
      } else {
        callLevels[step][i] = contCall;
        putLevels[step][i] = contPut;
      }
    }
  }

  return stockLevels.map((level, step) =>
    level.map((spot, i) => ({
      spot,
      call: callLevels[step][i],
      put: putLevels[step][i],
    }))
  );
}
