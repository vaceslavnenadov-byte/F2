import * as THREE from 'three';
import { fbm } from '../core/noise';
import { smoothstep } from '../core/math';
import { FLAT_ZONES, MESAS, WORLD_SIZE } from './config';
import type { DetailTextures } from './textures';

const HALF = WORLD_SIZE / 2;

/** Высота рельефа в точке мира. Единственный источник истины для земли, навигации и размещения объектов. */
export function heightAt(x: number, z: number): number {
  let h = (fbm(x * 0.018, z * 0.018, 5, 1) - 0.5) * 9;
  h += (fbm(x * 0.09, z * 0.09, 3, 7) - 0.5) * 1.2;

  let flat = 1;
  for (const zone of FLAT_ZONES) {
    const d = Math.hypot(x - zone.x, z - zone.z);
    flat = Math.min(flat, smoothstep(zone.r * 0.55, zone.r, d));
  }
  h *= 0.1 + 0.9 * flat;

  for (const m of MESAS) {
    const d = Math.hypot(x - m.x, z - m.z) + (fbm(x * 0.15, z * 0.15, 3, 31) - 0.5) * m.r * 0.6;
    const t = smoothstep(m.r, m.r - 2.2, d);
    if (t > 0) {
      // Террасы — слоистые уступы, как у настоящих останцов.
      const terrace = Math.floor(t * 3) / 3;
      h += m.h * (t * 0.7 + terrace * 0.3) * (0.9 + 0.2 * fbm(x * 0.1, z * 0.1, 2, 3));
    }
  }

  // Горное обрамление карты.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const mountain = smoothstep(HALF - 22, HALF - 2, edge);
  h += mountain * (10 + fbm(x * 0.05, z * 0.05, 4, 50) * 22);
  return h;
}

export function buildTerrain(tex: DetailTextures): THREE.Mesh {
  const seg = 256;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color('#d2a878');
  const sandDark = new THREE.Color('#b08460');
  const rock = new THREE.Color('#8a5a40');
  const rockLight = new THREE.Color('#b07a56');
  const dirt = new THREE.Color('#8d6a4c');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const slope = 1 - nrm.getY(i);
    c.copy(sand).lerp(sandDark, fbm(x * 0.05, z * 0.05, 3, 99));
    // Утоптанная земля в деревне.
    const village = smoothstep(20, 6, Math.hypot(x, z));
    c.lerp(dirt, village * 0.55 * fbm(x * 0.3, z * 0.3, 2, 4));
    // Скальные склоны с осадочными полосами.
    const rockT = smoothstep(0.18, 0.42, slope);
    if (rockT > 0) {
      const band = 0.5 + 0.5 * Math.sin(y * 2.2 + fbm(x * 0.1, z * 0.1, 2, 8) * 3);
      const rc = rock.clone().lerp(rockLight, band);
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
