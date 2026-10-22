export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Детерминированный ГПСЧ — мир генерируется одинаково при каждом запуске. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** Интерполяция углов по кратчайшей дуге. */
export function angleLerp(a: number, b: number, t: number): number {
  const twoPi = Math.PI * 2;
  const d = ((((b - a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return a + d * t;
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
