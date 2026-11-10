/** Weekly seasonality: all the models assume daily data. */
export const SEASON = 7;

/** Weekly seasonal naive: repeats the last observed week. */
export function naiveSeasonal(y: readonly number[], h: number): number[] {
  const last = y.slice(-SEASON);
  return Array.from({ length: h }, (_, i) => last[i % SEASON]!);
}

interface HoltWintersFit {
  level: number;
  trend: number;
  seasonal: number[];
  phi: number;
  sse: number;
}

/** One pass of additive Holt-Winters with damped trend; returns the final state and the one-step-ahead squared error. */
function holtWintersPass(y: readonly number[], alpha: number, beta: number, gamma: number, phi: number) {
  let level = mean(y, 0, SEASON);
  let trend = (mean(y, SEASON, 2 * SEASON) - mean(y, 0, SEASON)) / SEASON;
  const seasonal = y.slice(0, SEASON).map((v) => v - level);
  let sse = 0;

  for (let i = SEASON; i < y.length; i++) {
    const s = i % SEASON;
    const yi = y[i]!;
    const error = yi - (level + phi * trend + seasonal[s]!);
    sse += error * error;

    const newLevel = alpha * (yi - seasonal[s]!) + (1 - alpha) * (level + phi * trend);
    trend = beta * (newLevel - level) + (1 - beta) * phi * trend;
    seasonal[s] = gamma * (yi - level - phi * trend) + (1 - gamma) * seasonal[s]!;
    level = newLevel;
  }
  return { level, trend, seasonal, phi, sse };
}

function mean(y: readonly number[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i++) {
    total += y[i]!;
  }
  return total / (to - from);
}

// A small grid instead of a numerical optimizer: it keeps the cost of a request around a millisecond,
// which matters on the free Cloudflare Workers plan (about 10 ms of CPU per request).
const ALPHAS = [0.05, 0.15, 0.3];
const BETAS = [0.01, 0.05];
const GAMMAS = [0.05, 0.15, 0.3];
const PHIS = [0.9, 0.98];

/** Only the most recent year is used to fit: older days barely change the weekly pattern and cost CPU. */
const MAX_FIT_DAYS = 365;

/** Additive Holt-Winters with damped trend and weekly seasonality (the "ETS" of the Python service). */
export function ets(y: readonly number[], h: number): number[] {
  if (y.length < 2 * SEASON) {
    throw new Error("at least two weeks of data are needed");
  }
  const x = y.length > MAX_FIT_DAYS ? y.slice(-MAX_FIT_DAYS) : y;

  let best: HoltWintersFit | null = null;
  for (const alpha of ALPHAS) {
    for (const beta of BETAS) {
      for (const gamma of GAMMAS) {
        for (const phi of PHIS) {
          const fit = holtWintersPass(x, alpha, beta, gamma, phi);
          if (Number.isFinite(fit.sse) && (best === null || fit.sse < best.sse)) {
            best = fit;
          }
        }
      }
    }
  }
  if (best === null) {
    throw new Error("the model could not be fitted");
  }

  const out: number[] = [];
  let damp = 0;
  let power = 1;
  for (let k = 1; k <= h; k++) {
    power *= best.phi;
    damp += power;
    out.push(best.level + damp * best.trend + best.seasonal[(x.length + k - 1) % SEASON]!);
  }
  return out;
}

export const METHODS = {
  naive: naiveSeasonal,
  ets,
} as const;
