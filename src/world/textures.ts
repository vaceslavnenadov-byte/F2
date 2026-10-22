import * as THREE from 'three';
import { mulberry32 } from '../core/math';

/** Бесшовный шум: сумма октав случайных решёток со сглаженной билинейной интерполяцией. */
function tileableNoise(size: number, octaves: number, seed: number, baseCells = 4): Float32Array {
  const out = new Float32Array(size * size);
  const rnd = mulberry32(seed);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = baseCells << o;
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const x1 = (x0 + 1) % cells;
        const a = grid[y0 * cells + x0];
        const b = grid[y0 * cells + x1];
        const c = grid[y1 * cells + x0];
        const d = grid[y1 * cells + x1];
        const v = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
        out[y * size + x] += v * amp;
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvasTexture(size: number, draw: (img: ImageData) => void, srgb: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  draw(img);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

function normalFromHeight(h: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  return canvasTexture(
    size,
    (img) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const l = h[y * size + ((x - 1 + size) % size)];
          const r = h[y * size + ((x + 1) % size)];
          const u = h[((y - 1 + size) % size) * size + x];
          const d = h[((y + 1) % size) * size + x];
          let nx = (l - r) * strength;
          let ny = (u - d) * strength;
          let nz = 1;
          const len = Math.hypot(nx, ny, nz);
          nx /= len;
          ny /= len;
          nz /= len;
          const i = (y * size + x) * 4;
          img.data[i] = (nx * 0.5 + 0.5) * 255;
          img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
          img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
          img.data[i + 3] = 255;
        }
      }
    },
    false,
  );
}

export interface DetailTextures {
  sandMap: THREE.Texture;
  sandNormal: THREE.Texture;
  rockNormal: THREE.Texture;
  thatchMap: THREE.Texture;
  woodMap: THREE.Texture;
}

export function createTextures(): DetailTextures {
  const size = 256;

  // Песок: мелкое зерно + крупные пятна.
  const sandH = tileableNoise(size, 6, 11, 8);
  const sandMap = canvasTexture(
    size,
    (img) => {
      for (let i = 0; i < size * size; i++) {
        const v = 0.78 + sandH[i] * 0.3;
        img.data[i * 4] = v * 255;
        img.data[i * 4 + 1] = v * 250;
        img.data[i * 4 + 2] = v * 240;
        img.data[i * 4 + 3] = 255;
      }
    },
    true,
  );
  const sandNormal = normalFromHeight(sandH, size, 6);

  const rockH = tileableNoise(size, 5, 23, 4);
  const rockNormal = normalFromHeight(rockH, size, 10);

  // Солома: вертикальные волокна.
  const rnd = mulberry32(5);
  const thatchMap = canvasTexture(
    size,
    (img) => {
      const cols = new Float32Array(size);
      for (let x = 0; x < size; x++) cols[x] = 0.6 + rnd() * 0.4;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = cols[x] * (0.85 + 0.15 * sandH[y * size + x]);
          const i = (y * size + x) * 4;
          img.data[i] = v * 205;
          img.data[i + 1] = v * 168;
          img.data[i + 2] = v * 100;
          img.data[i + 3] = 255;
        }
      }
    },
    true,
  );

  // Древесина: волокна вдоль V.
  const woodMap = canvasTexture(
    size,
    (img) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = rockH[(y % size) * size + ((x * 7) % size)];
          const v = 0.55 + 0.45 * Math.abs(Math.sin(x * 0.35 + n * 8));
          const i = (y * size + x) * 4;
          img.data[i] = v * 120;
          img.data[i + 1] = v * 92;
          img.data[i + 2] = v * 66;
          img.data[i + 3] = 255;
        }
      }
    },
    true,
  );

  return { sandMap, sandNormal, rockNormal, thatchMap, woodMap };
}
