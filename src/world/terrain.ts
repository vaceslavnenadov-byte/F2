import * as THREE from 'three';
import { fbm } from '../core/noise';
import { smoothstep } from '../core/math';
import { WORLD_SIZE } from './config';
import type { DetailTextures } from './textures';

const HALF = WORLD_SIZE / 2;

export interface Circle { x: number; z: number; r: number }
export interface Mesa { x: number; z: number; r: number; h: number }

export interface TerrainParams {
  seed: number;
  /** Амплитуда холмов. */
  hills: number;
  flatZones: Circle[];
  mesas: Mesa[];
  /** Тропы и дороги — подкрашиваются утоптанной землёй. */
  paths: [number, number][][];
  /** Площадки с иной почвой (асфальт, утоптанная земля). */
  groundZones?: (Circle & { color: string; strength: number })[];
  palette: { sand: string; sandDark: string; rock: string; rockLight: string; dirt: string };
}

export const DESERT_PALETTE = { sand: '#d2a878', sandDark: '#b08460', rock: '#8a5a40', rockLight: '#b07a56', dirt: '#8d6a4c' };

let P: TerrainParams = { seed: 0, hills: 9, flatZones: [], mesas: [], paths: [], palette: DESERT_PALETTE };

/** Переключает активный рельеф: все heightAt дальше считаются по новой локации. */
export function setTerrain(p: TerrainParams) { P = p; }
export function terrainParams() { return P; }

/** Высота рельефа в точке мира. Единственный источник истины для земли, навигации и размещения объектов. */
export function heightAt(x: number, z: number): number {
  const s = P.seed;
  let h = (fbm(x * 0.018, z * 0.018, 5, 1 + s) - 0.5) * P.hills;
  h += (fbm(x * 0.09, z * 0.09, 3, 7 + s) - 0.5) * 1.2;

  let flat = 1;
  for (const zone of P.flatZones) {
    const d = Math.hypot(x - zone.x, z - zone.z);
    flat = Math.min(flat, smoothstep(zone.r * 0.55, zone.r, d));
  }
  h *= 0.1 + 0.9 * flat;

  for (const m of P.mesas) {
    const d = Math.hypot(x - m.x, z - m.z) + (fbm(x * 0.15, z * 0.15, 3, 31 + s) - 0.5) * m.r * 0.6;
    const t = smoothstep(m.r, m.r - 2.2, d);
    if (t > 0) {
      // Террасы — слоистые уступы, как у настоящих останцов.
      const terrace = Math.floor(t * 3) / 3;
      h += m.h * (t * 0.7 + terrace * 0.3) * (0.9 + 0.2 * fbm(x * 0.1, z * 0.1, 2, 3 + s));
    }
  }

  // Горное обрамление карты.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const mountain = smoothstep(HALF - 22, HALF - 2, edge);
  h += mountain * (10 + fbm(x * 0.05, z * 0.05, 4, 50 + s) * 22);
  return h;
}

function distToSegment(px: number, pz: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

export function distToPaths(x: number, z: number): number {
  let d = Infinity;
  for (const path of P.paths) for (let i = 0; i < path.length - 1; i++) d = Math.min(d, distToSegment(x, z, path[i], path[i + 1]));
  return d;
}

export function buildTerrain(tex: DetailTextures): THREE.Mesh {
  const seg = 256;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const pal = P.palette;
  const sand = new THREE.Color(pal.sand);
  const sandDark = new THREE.Color(pal.sandDark);
  const rock = new THREE.Color(pal.rock);
  const rockLight = new THREE.Color(pal.rockLight);
  const dirt = new THREE.Color(pal.dirt);
  const zoneCols = (P.groundZones ?? []).map((z) => ({ ...z, c: new THREE.Color(z.color) }));
  const c = new THREE.Color();
  const rc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const slope = 1 - nrm.getY(i);
    c.copy(sand).lerp(sandDark, fbm(x * 0.05, z * 0.05, 3, 99 + P.seed));
    for (const zc of zoneCols) {
      const k = smoothstep(zc.r, zc.r * 0.6, Math.hypot(x - zc.x, z - zc.z)) * zc.strength;
      if (k > 0) c.lerp(zc.c, k * (0.75 + 0.25 * fbm(x * 0.3, z * 0.3, 2, 4)));
    }
    const pd = distToPaths(x, z);
    if (pd < 3) c.lerp(dirt, smoothstep(3, 1, pd) * (0.55 + 0.25 * fbm(x * 0.4, z * 0.4, 2, 5)));
    const rockT = smoothstep(0.18, 0.42, slope);
    if (rockT > 0) {
      const band = 0.5 + 0.5 * Math.sin(y * 2.2 + fbm(x * 0.1, z * 0.1, 2, 8) * 3);
      rc.copy(rock).lerp(rockLight, band);
      c.lerp(rc, rockT);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const map = tex.sandMap.clone();
  map.repeat.set(40, 40);
  const normalMap = tex.sandNormal.clone();
  normalMap.repeat.set(40, 40);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
