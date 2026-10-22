import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { fbm } from '../core/noise';
import { mulberry32 } from '../core/math';
import { ParticleSystem } from '../engine/particles';
import { WORLD_SIZE } from './config';
import { NavGrid } from './nav';
import { buildTerrain, distToPaths, heightAt, setTerrain, type Circle } from './terrain';
import { createTextures, type DetailTextures } from './textures';
import type { LocationDef } from './locations/types';

export interface Interactable {
  id: string;
  name: string;
  object: THREE.Object3D;
  /** Точка, к которой подходит игрок. */
  approach: THREE.Vector3;
}

/** Смещает вершины шумом от их позиции — общие вершины смещаются одинаково, щелей нет. */
export function jitter(geo: THREE.BufferGeometry, amount: number, freq: number, seed: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dx = (fbm(v.x * freq + 10, v.y * freq + v.z * 0.7 * freq, 3, seed) - 0.5) * amount;
    const dy = (fbm(v.y * freq + 20, v.z * freq, 3, seed + 1) - 0.5) * amount;
    const dz = (fbm(v.z * freq + 30, v.x * freq, 3, seed + 2) - 0.5) * amount;
    pos.setXYZ(i, v.x + dx, v.y + dy, v.z + dz);
  }
  geo.computeVertexNormals();
  return geo;
}

export function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 6): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  geo.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  geo.applyQuaternion(q);
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/** Зелёная «сетка выхода» на краю карты, как в оригинале. */
const exitMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        if (r > 1.0) discard;
        vec2 g = abs(fract(vUv * 12.0) - 0.5);
        float grid = smoothstep(0.42, 0.5, max(g.x, g.y));
        float pulse = 0.55 + 0.45 * sin(uTime * 2.5 - r * 6.0);
        float edge = smoothstep(0.8, 1.0, r);
        float a = (grid * 0.6 + 0.12 + edge * 0.5) * pulse * (1.0 - smoothstep(0.95, 1.0, r));
        gl_FragColor = vec4(vec3(0.25, 1.4, 0.35) * a, a);
      }`,
  });

export class World {
  readonly group = new THREE.Group();
  readonly nav: NavGrid;
  readonly terrain: THREE.Mesh;
  readonly interactables: Interactable[] = [];
  readonly fire = new ParticleSystem(2000, THREE.AdditiveBlending, -1.2, 0.6);
  readonly smoke = new ParticleSystem(400, THREE.NormalBlending, -0.15, 0.3);
  readonly dust = new ParticleSystem(400, THREE.NormalBlending, 0, 0);
  readonly tex: DetailTextures;
  readonly rnd: () => number;
  readonly mat: Record<string, THREE.MeshStandardMaterial>;
  private readonly timeUniform = { value: 0 };
  private readonly flames: { pos: THREE.Vector3; light: THREE.PointLight | null; base: number; scale: number }[] = [];
  private readonly exitMats: THREE.ShaderMaterial[] = [];
  private readonly steams: THREE.Vector3[] = [];
  /** Океан с отражениями (если у локации есть уровень моря). */
  water: Water | null = null;
  private fireAcc = 0;

  constructor(readonly loc: LocationDef, flags: Set<string> = new Set()) {
    setTerrain(loc.terrain);
    this.rnd = mulberry32(loc.terrain.seed * 7919 + 2241);
    this.tex = createTextures();
    this.terrain = buildTerrain(this.tex);
    this.group.add(this.terrain);
    this.nav = new NavGrid();

    const rockNormal = this.tex.rockNormal.clone();
    rockNormal.repeat.set(2, 2);
    const mudMap = this.tex.sandMap.clone();
    mudMap.repeat.set(3, 2);
    const thatch = this.tex.thatchMap.clone();
    thatch.repeat.set(6, 1);
    const wood = this.tex.woodMap.clone();
    wood.repeat.set(1, 2);
    const planks = this.tex.woodMap.clone();
    planks.repeat.set(3, 1);
    planks.rotation = Math.PI / 2;
    this.mat = {
      mud: new THREE.MeshStandardMaterial({ color: '#a27a58', map: mudMap, normalMap: rockNormal, roughness: 0.95 }),
      thatch: new THREE.MeshStandardMaterial({ color: '#d8bf86', map: thatch, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ color: '#8a6a50', map: wood, roughness: 0.9 }),
      planks: new THREE.MeshStandardMaterial({ color: '#9a7a5c', map: planks, roughness: 0.9 }),
      darkWood: new THREE.MeshStandardMaterial({ color: '#4a3526', map: wood, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: '#a39282', normalMap: rockNormal, roughness: 0.92 }),
      concrete: new THREE.MeshStandardMaterial({ color: '#8f8a82', map: mudMap, normalMap: rockNormal, roughness: 0.95 }),
      rock: new THREE.MeshStandardMaterial({ color: '#9a7058', normalMap: rockNormal, roughness: 0.95 }),
      bone: new THREE.MeshStandardMaterial({ color: '#e6dcc4', roughness: 0.7 }),
      void: new THREE.MeshStandardMaterial({ color: '#070504', roughness: 1 }),
      clay: new THREE.MeshStandardMaterial({ color: '#a8603e', roughness: 0.8 }),
      paintRed: new THREE.MeshStandardMaterial({ color: '#8e2f22', map: wood, roughness: 0.85 }),
      paintBlue: new THREE.MeshStandardMaterial({ color: '#2f5a74', map: wood, roughness: 0.85 }),
      plant: new THREE.MeshStandardMaterial({ color: '#6f7a45', roughness: 0.9 }),
      egg: new THREE.MeshStandardMaterial({ color: '#d9cfa8', roughness: 0.5 }),
      rust: new THREE.MeshStandardMaterial({ color: '#7a4a32', normalMap: rockNormal, roughness: 0.75, metalness: 0.45 }),
      metal: new THREE.MeshStandardMaterial({ color: '#6c6a66', roughness: 0.5, metalness: 0.7 }),
      tin: new THREE.MeshStandardMaterial({ color: '#6e645a', normalMap: rockNormal, roughness: 0.75, metalness: 0.35 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#1c1a18', roughness: 0.9 }),
      glow: new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffa040', emissiveIntensity: 1.5 }),
    };

    if (loc.terrain.water !== undefined) this.buildOcean(loc.terrain.water);
    loc.build(this, flags);
    this.buildExits(loc.exits);
    const reserved = [...loc.scatter.reserved, ...loc.exits.map((e) => ({ ...e, r: e.r + 3 }))];
    this.scatterRocks(loc.scatter.rocks, reserved);
    this.scatterTrees(loc.scatter.trees, reserved);
    this.scatterGrass(loc.scatter.grass, reserved);
    this.group.add(this.fire.points, this.smoke.points, this.dust.points);
  }

  y(x: number, z: number) { return heightAt(x, z); }

  place(obj: THREE.Object3D, x: number, z: number, rotY = 0, sink = 0.1) {
    obj.position.set(x, this.y(x, z) - sink, z);
    obj.rotation.y = rotY;
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(obj);
    return obj;
  }

  /** Для построек: опускаем основание до самой низкой точки площадки. */
  placeFlat(obj: THREE.Object3D, x: number, z: number, rotY: number, radius: number) {
    let min = Infinity;
    for (let a = 0; a < 8; a++) min = Math.min(min, this.y(x + Math.cos(a) * radius, z + Math.sin(a) * radius));
    min = Math.min(min, this.y(x, z));
    this.place(obj, x, z, rotY, 0);
    obj.position.y = min - 0.1;
    return obj;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mt of mats) mt.dispose();
    });
  }

  // ─── Библиотека построек и реквизита ──────────────────────────────────────

  hut(r: number, h: number, seed: number): THREE.Group {
    const g = new THREE.Group();
    const walls = jitter(new THREE.CylinderGeometry(r, r * 1.08, h, 28, 4), 0.25, 0.8, seed);
    const wallMesh = new THREE.Mesh(walls, this.mat.mud);
    wallMesh.position.y = h / 2;
    g.add(wallMesh);
    const roof = new THREE.Mesh(jitter(new THREE.ConeGeometry(r * 1.42, h * 1.05, 28, 5), 0.35, 0.6, seed + 5), this.mat.thatch);
    roof.position.y = h + h * 0.45;
    g.add(roof);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 6), this.mat.darkWood);
    tip.position.y = h + h * 1.05;
    g.add(tip);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.5), this.mat.void);
    door.position.set(0, 0.85, r * 0.95);
    g.add(door);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.9, 6), this.mat.darkWood);
      post.position.set(sx * 0.58, 0.95, r * 1.02);
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), this.mat.darkWood);
    lintel.rotation.z = Math.PI / 2;
    lintel.position.set(0, 1.85, r * 1.02);
    g.add(lintel);
    return g;
  }

  /** Дощатая хибара с двускатной крышей; дверь смотрит в +Z. */
  shack(w: number, d: number, h: number, seed: number, opts: { porch?: boolean; sign?: string } = {}): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(w, h, d, 4, 3, 4), 0.06, 1, seed), this.mat.planks);
    body.position.y = h / 2;
    g.add(body);
    // Двускатная крыша из двух наклонных плит.
    const roofW = w / 2 / Math.cos(0.45) + 0.3;
    for (const sx of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.12, d + 0.6), this.mat.tin);
      slab.position.set(sx * w * 0.25, h + Math.tan(0.45) * w * 0.25, 0);
      slab.rotation.z = -sx * 0.45;
      g.add(slab);
    }
    const gable = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, Math.tan(0.45) * w / 2)]);
    for (const sz of [-1, 1]) {
      const tri = new THREE.Mesh(new THREE.ShapeGeometry(gable), this.mat.planks);
      tri.position.set(0, h, sz * (d / 2 + 0.01));
      if (sz < 0) tri.rotation.y = Math.PI;
      g.add(tri);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.12), this.mat.void);
    door.position.set(0, 0.95, d / 2 + 0.01);
    g.add(door);
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.1), this.mat.void);
      win.position.set(sx * w * 0.3, h * 0.6, d / 2 + 0.02);
      g.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.14), this.mat.darkWood);
      frame.position.set(sx * w * 0.3, h * 0.6 - 0.32, d / 2 + 0.04);
      g.add(frame);
    }
    if (opts.porch) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, 2), this.mat.darkWood);
      deck.position.set(0, 0.08, d / 2 + 1);
      g.add(deck);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h * 0.85, 6), this.mat.darkWood);
        post.position.set(sx * (w / 2 - 0.2), h * 0.42, d / 2 + 1.9);
        g.add(post);
      }
      const awning = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.08, 2.3), this.mat.tin);
      awning.position.set(0, h * 0.86, d / 2 + 1.1);
      awning.rotation.x = 0.12;
      g.add(awning);
    }
    if (opts.sign) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.7, 4), 0.6, 0.08), this.mat.paintRed);
      board.position.set(0, h + 0.15, d / 2 + 0.1);
      g.add(board);
    }
    return g;
  }

  waterTower(): THREE.Group {
    const g = new THREE.Group();
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), this.mat.darkWood);
      leg.position.set(x * 1.1, 3, z * 1.1);
      leg.rotation.set(-z * 0.05, 0, x * 0.05);
      g.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.4, 20), this.mat.planks);
    tank.position.y = 7.2;
    g.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1, 20), this.mat.tin);
    cap.position.y = 8.9;
    g.add(cap);
    for (const y of [6.4, 8]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.04, 4, 24), this.mat.rust);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      g.add(band);
    }
    return g;
  }

  pot(): THREE.Mesh {
    const pts = [[0.0, 0], [0.18, 0], [0.26, 0.12], [0.3, 0.3], [0.24, 0.48], [0.14, 0.56], [0.16, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 14), this.mat.clay);
  }

  barrel(burning: boolean): THREE.Group {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.9, 14, 1, burning), this.mat.rust);
    b.position.y = 0.45;
    g.add(b);
    for (const y of [0.2, 0.7]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.025, 4, 16), this.mat.metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
    }
    return g;
  }

  burningBarrel(x: number, z: number) {
    this.place(this.barrel(true), x, z, 0, 0.02);
    this.addFlame(new THREE.Vector3(x, this.y(x, z) + 0.85, z), 9, 0.5);
    this.nav.blockCircle(x, z, 0.5);
  }

  crate(s = 0.8): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(s, s, s), this.mat.wood);
  }

  tire(): THREE.Mesh {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.13, 8, 16), this.mat.rubber);
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.13;
    return t;
  }

  /** Ржавый остов довоенного автомобиля. */
  carWreck(seed: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(1.9, 0.7, 4.4, 4, 2, 6), 0.12, 1.5, seed), this.mat.rust);
    body.position.y = 0.6;
    g.add(body);
    const cabin = new THREE.Mesh(jitter(new THREE.BoxGeometry(1.6, 0.6, 2, 3, 2, 3), 0.1, 2, seed + 1), this.mat.rust);
    cabin.position.set(0, 1.2, -0.2);
    g.add(cabin);
    for (const sz of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.42, 0.05), this.mat.void);
      win.position.set(0, 1.22, -0.2 + sz * 1.0);
      win.rotation.x = sz * 0.25;
      g.add(win);
    }
    for (const [x, z] of [[-0.9, 1.4], [0.9, 1.4], [-0.9, -1.4]]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 6, 12), this.mat.rubber);
      w.rotation.y = Math.PI / 2;
      w.position.set(x, 0.32, z);
      g.add(w);
    }
    g.rotation.z = 0.05;
    return g;
  }

  /** Полуразрушенное бетонное здание: стены с проломами и неровным верхом. */
  ruin(w: number, d: number, h: number, seed: number): THREE.Group {
    const g = new THREE.Group();
    const rnd = mulberry32(seed);
    const wall = (len: number, along: 'x' | 'z', ox: number, oz: number) => {
      const n = Math.max(2, Math.round(len / 1.5));
      const seg = len / n;
      for (let i = 0; i < n; i++) {
        const isDoor = along === 'x' && oz > 0 && i === Math.floor(n / 2);
        const hh = isDoor ? 0 : h * (0.45 + rnd() * 0.55);
        if (hh < 0.5) continue;
        const geo = jitter(new THREE.BoxGeometry(along === 'x' ? seg : 0.35, hh, along === 'x' ? 0.35 : seg, 2, 3, 2), 0.12, 1.3, seed + i);
        const m = new THREE.Mesh(geo, this.mat.concrete);
        const off = -len / 2 + seg * (i + 0.5);
        m.position.set(along === 'x' ? ox + off : ox, hh / 2, along === 'x' ? oz : oz + off);
        g.add(m);
        // Тёмные проёмы окон.
        if (hh > h * 0.7 && rnd() < 0.6) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? 0.6 : 0.4, 0.6, along === 'x' ? 0.4 : 0.6), this.mat.void);
          win.position.set(m.position.x, hh * 0.65, m.position.z);
          g.add(win);
        }
      }
    };
    wall(w, 'x', 0, d / 2);
    wall(w, 'x', 0, -d / 2);
    wall(d, 'z', w / 2, 0);
    wall(d, 'z', -w / 2, 0);
    // Обломки у стен.
    for (let i = 0; i < 5; i++) {
      const chunk = new THREE.Mesh(jitter(new THREE.BoxGeometry(0.6, 0.4, 0.5), 0.15, 2, seed + 50 + i), this.mat.concrete);
      chunk.position.set((rnd() - 0.5) * (w + 2), 0.15, (rnd() > 0.5 ? 1 : -1) * (d / 2 + 0.6 + rnd()));
      chunk.rotation.set(rnd(), rnd() * 3, rnd());
      g.add(chunk);
    }
    return g;
  }

  /** Блокирует навигацию по периметру прямоугольника (стены), оставляя проём двери в +Z. */
  blockWalls(x: number, z: number, w: number, d: number, rotY: number, door = 1.4) {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const pt = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
    const seg = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
      for (let i = 0; i <= n; i++) {
        const lx = ax + ((bx - ax) * i) / n;
        const lz = az + ((bz - az) * i) / n;
        if (az === d / 2 && bz === d / 2 && Math.abs(lx) < door / 2) continue;
        const [px, pz] = pt(lx, lz);
        this.nav.blockCircle(px, pz, 0.45);
      }
    };
    seg(-w / 2, -d / 2, w / 2, -d / 2);
    seg(-w / 2, d / 2, w / 2, d / 2);
    seg(-w / 2, -d / 2, -w / 2, d / 2);
    seg(w / 2, -d / 2, w / 2, d / 2);
  }

  totem(): THREE.Group {
    const g = new THREE.Group();
    const mats = [this.mat.darkWood, this.mat.paintRed, this.mat.wood, this.mat.paintBlue];
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const hh = 0.6 + (i % 2) * 0.2;
      const seg = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.26, 0.3, hh, 8), 0.06, 2, i), mats[i]);
      seg.position.y = y + hh / 2;
      g.add(seg);
      y += hh;
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.mat.bone);
    skull.scale.set(1, 0.9, 1.2);
    skull.position.y = y + 0.18;
    g.add(skull);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), this.mat.void);
      eye.position.set(sx * 0.08, y + 0.22, 0.22);
      g.add(eye);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.45, 6), this.mat.bone);
      horn.position.set(sx * 0.25, y + 0.35, 0);
      horn.rotation.z = -sx * 0.9;
      g.add(horn);
    }
    return g;
  }

  addFlame(pos: THREE.Vector3, intensity: number, scale: number, light = true) {
    let l: THREE.PointLight | null = null;
    if (light) {
      l = new THREE.PointLight(0xff8a3a, intensity, 16, 1.6);
      l.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
      this.group.add(l);
    }
    this.flames.push({ pos, light: l, base: intensity, scale });
  }

  torch(x: number, z: number) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), this.mat.darkWood);
    pole.position.y = 1.1;
    g.add(pole);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.1, 0.25, 8), this.mat.darkWood);
    bowl.position.y = 2.25;
    g.add(bowl);
    this.place(g, x, z, 0, 0.05);
    this.addFlame(new THREE.Vector3(x, this.y(x, z) + 2.35, z), 6, 0.45);
    this.nav.blockCircle(x, z, 0.4);
  }

  boulder(scale: THREE.Vector3, seed: number): THREE.Mesh {
    const m = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(1, 2), 0.6, 0.9, seed), this.mat.rock);
    m.scale.copy(scale);
    return m;
  }

  /** Изгородь из столбов и жердей по ломаной; блокирует проход. */
  fence(points: [number, number][], closed = false) {
    const g = new THREE.Group();
    const pts = closed ? [...points, points[0]] : points;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[k + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
      for (let i = 0; i <= n; i++) {
        const px = ax + ((bx - ax) * i) / n;
        const pz = az + ((bz - az) * i) / n;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6), this.mat.darkWood);
        post.position.set(px, this.y(px, pz) + 0.6, pz);
        g.add(post);
      }
      for (const yy of [0.55, 1.05]) {
        g.add(new THREE.Mesh(cylinderBetween(
          new THREE.Vector3(ax, this.y(ax, az) + yy, az),
          new THREE.Vector3(bx, this.y(bx, bz) + yy, bz), 0.05, 0.05), this.mat.wood));
      }
      const m = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
      for (let i = 0; i <= m; i++) this.nav.blockCircle(ax + ((bx - ax) * i) / m, az + ((bz - az) * i) / m, 0.5);
    }
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = o.receiveShadow = true) : null));
    this.group.add(g);
  }

  private buildOcean(level: number) {
    const normals = this.tex.rockNormal.clone();
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    this.water = new Water(new THREE.PlaneGeometry(1200, 1200), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0.5, 0.6, 0.3).normalize(),
      sunColor: 0xffe6c0,
      waterColor: 0x0c2a34,
      distortionScale: 2.2,
      fog: true,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = level;
    this.group.add(this.water);
  }

  /** Столб пара (градирни, трубы). */
  addSteam(pos: THREE.Vector3) { this.steams.push(pos); }

  nearestFlame(p: THREE.Vector3): number {
    let d = Infinity;
    for (const f of this.flames) d = Math.min(d, Math.hypot(f.pos.x - p.x, f.pos.z - p.z));
    return d;
  }

  interactable(it: Interactable) { this.interactables.push(it); }

  // ─── Выходы на карту мира ─────────────────────────────────────────────────

  private buildExits(exits: Circle[]) {
    for (const e of exits) {
      const seg = 32;
      const geo = new THREE.PlaneGeometry(e.r * 2, e.r * 2, seg, seg).rotateX(-Math.PI / 2);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this.y(e.x + pos.getX(i), e.z + pos.getZ(i)) + 0.08);
      }
      const mat = exitMaterial();
      this.exitMats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(e.x, 0, e.z);
      m.renderOrder = 4;
      this.group.add(m);
      // Указатель на столбе.
      const sign = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 6), this.mat.darkWood);
      post.position.y = 1.1;
      sign.add(post);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.06), this.mat.wood);
      board.position.set(0.4, 1.9, 0);
      sign.add(board);
      const ang = Math.atan2(-e.x, -e.z);
      this.place(sign, e.x + Math.sin(ang) * (e.r + 0.8) + Math.cos(ang) * 1.5, e.z + Math.cos(ang) * (e.r + 0.8) - Math.sin(ang) * 1.5, ang, 0.05);
    }
  }

  // ─── Рассыпка окружения ───────────────────────────────────────────────────

  private isReserved(x: number, z: number, reserved: Circle[], pad = 0): boolean {
    return reserved.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + pad) || distToPaths(x, z) < 2.2;
  }

  private scatterRocks(count: number, reserved: Circle[]) {
    const geos = [0, 1, 2].map((i) => jitter(new THREE.IcosahedronGeometry(1, 2), 0.7, 0.8, 100 + i));
    for (let gi = 0; gi < geos.length; gi++) {
      const matrices: THREE.Matrix4[] = [];
      for (let n = 0; n < count / 3; n++) {
        const x = (this.rnd() - 0.5) * (WORLD_SIZE - 10);
        const z = (this.rnd() - 0.5) * (WORLD_SIZE - 10);
        const big = this.rnd() < 0.22;
        if (this.isReserved(x, z, reserved, big ? 3 : 0)) continue;
        const s = big ? 1.1 + this.rnd() * 1.6 : 0.15 + this.rnd() * 0.4;
        const sc = new THREE.Vector3(s * (0.8 + this.rnd() * 0.5), s * (0.5 + this.rnd() * 0.4), s * (0.8 + this.rnd() * 0.5));
        matrices.push(new THREE.Matrix4().compose(
          new THREE.Vector3(x, this.y(x, z) - sc.y * 0.25, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rnd() * 0.3, this.rnd() * 6.28, this.rnd() * 0.3)),
          sc,
        ));
        if (big) this.nav.blockCircle(x, z, Math.max(sc.x, sc.z) * 0.85);
      }
      const im = new THREE.InstancedMesh(geos[gi], this.mat.rock, matrices.length);
      matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = im.receiveShadow = true;
      this.group.add(im);
    }
  }

  deadTreeGeometry(seed: number): THREE.BufferGeometry {
    const rnd = mulberry32(seed);
    const parts: THREE.BufferGeometry[] = [];
    const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
      const to = from.clone().addScaledVector(dir, len);
      parts.push(cylinderBetween(from, to, r, r * 0.65, 6));
      if (depth === 0) return;
      const n = depth > 2 ? 2 : 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const nd = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.6, rnd() * 0.5, (rnd() - 0.5) * 1.6)).normalize();
        grow(to, nd, len * (0.6 + rnd() * 0.2), r * 0.6, depth - 1);
      }
    };
    grow(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3).normalize(), 2.2, 0.2, 3);
    return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  }

  tree(x: number, z: number, scale = 1.3, variant = 0) {
    const t = new THREE.Mesh(this.deadTreeGeometry(variant * 31 + 31), this.mat.darkWood);
    t.scale.setScalar(scale);
    this.place(t, x, z, x, 0);
    this.nav.blockCircle(x, z, 0.5);
  }

  private scatterTrees(count: number, reserved: Circle[]) {
    const geos = [1, 2, 3].map((s) => this.deadTreeGeometry(s * 31));
    let placed = 0;
    for (let n = 0; n < count * 6 && placed < count; n++) {
      const x = (this.rnd() - 0.5) * (WORLD_SIZE - 16);
      const z = (this.rnd() - 0.5) * (WORLD_SIZE - 16);
      if (this.isReserved(x, z, reserved, 2)) continue;
      const [i, j] = this.nav.cellOf(x, z);
      if (!this.nav.isWalkable(i, j)) continue;
      const tree = new THREE.Mesh(geos[placed % 3], this.mat.darkWood);
      tree.scale.setScalar(0.8 + this.rnd() * 0.7);
      this.place(tree, x, z, this.rnd() * 6, 0);
      this.nav.blockCircle(x, z, 0.5);
      placed++;
    }
  }

  private scatterGrass(count: number, reserved: Circle[]) {
    const blades: number[] = [];
    const normals: number[] = [];
    const rnd = mulberry32(77);
    for (let b = 0; b < 9; b++) {
      const a = rnd() * Math.PI * 2;
      const lean = 0.15 + rnd() * 0.35;
      const h = 0.35 + rnd() * 0.45;
      const w = 0.035;
      const cx = Math.cos(a) * 0.06;
      const cz = Math.sin(a) * 0.06;
      const px = -Math.sin(a) * w;
      const pz = Math.cos(a) * w;
      blades.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
      for (let k = 0; k < 3; k++) normals.push(0, 1, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide });
    const time = this.timeUniform;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = position.y * position.y * 1.6;
        transformed.x += sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.2) * 0.12 * sway;
        transformed.z += cos(uTime * 1.3 + wp.x * 0.2) * 0.08 * sway;`,
      );
    };
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    for (let n = 0; n < count; n++) {
      const x = (this.rnd() - 0.5) * (WORLD_SIZE - 12);
      const z = (this.rnd() - 0.5) * (WORLD_SIZE - 12);
      if (reserved.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r * 0.3)) continue;
      if (fbm(x * 0.07, z * 0.07, 3, 400) < 0.45) continue;
      const [i, j] = this.nav.cellOf(x, z);
      if (!this.nav.inBounds(i, j) || this.nav.blocked[this.nav.idx(i, j)]) continue;
      const s = 0.7 + this.rnd() * 0.9;
      matrices.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, this.y(x, z) - 0.03, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rnd() * 6.28, 0)),
        new THREE.Vector3(s, s * (0.8 + this.rnd() * 0.5), s),
      ));
      colors.push(new THREE.Color().setHSL(0.1 + this.rnd() * 0.04, 0.35 + this.rnd() * 0.2, 0.42 + this.rnd() * 0.15));
    }
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, matrices.length));
    im.count = matrices.length;
    matrices.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, colors[i]);
    });
    im.receiveShadow = true;
    this.group.add(im);
  }

  // ─── Анимация мира ────────────────────────────────────────────────────────

  update(dt: number, time: number, focus: THREE.Vector3, sunDir?: THREE.Vector3) {
    this.timeUniform.value = time;
    if (this.water) {
      const u = this.water.material.uniforms;
      u.time.value += dt * 0.6;
      if (sunDir) u.sunDirection.value.copy(sunDir).normalize();
    }
    for (const m of this.exitMats) m.uniforms.uTime.value = time;
    this.fireAcc += dt;
    const c = new THREE.Color();
    while (this.fireAcc > 1 / 60) {
      this.fireAcc -= 1 / 60;
      for (const f of this.flames) {
        // Далёкие огни не тратят частицы.
        if (Math.abs(f.pos.x - focus.x) > 45 || Math.abs(f.pos.z - focus.z) > 45) continue;
        const s = f.scale;
        for (let k = 0; k < Math.ceil(2 * s); k++) {
          c.setRGB(4 + Math.random() * 2, 1.4 + Math.random() * 0.8, 0.3);
          this.fire.emit({
            pos: f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6 * s, 0, (Math.random() - 0.5) * 0.6 * s)),
            vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.3),
            life: 0.5 + Math.random() * 0.4,
            size: 0.55 * s + Math.random() * 0.3 * s,
            grow: 0.2,
            color: c,
          });
        }
        if (s > 0.8 && Math.random() < 0.25) {
          c.setRGB(0.25, 0.22, 0.2);
          this.smoke.emit({
            pos: f.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
            vel: new THREE.Vector3((Math.random() - 0.5) * 0.3 + 0.3, 0.8, (Math.random() - 0.5) * 0.3),
            life: 4,
            size: 1.0,
            grow: 4,
            alpha: 0.35,
            color: c,
          });
        }
        if (f.light) f.light.intensity = f.base * (0.8 + Math.random() * 0.35);
      }
      for (const sp of this.steams) {
        if (Math.random() < 0.35) {
          c.setRGB(0.9, 0.9, 0.9);
          this.smoke.emit({
            pos: sp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)),
            vel: new THREE.Vector3(0.8 + Math.random() * 0.4, 1.5 + Math.random(), (Math.random() - 0.5) * 0.4),
            life: 6,
            size: 4,
            grow: 3,
            alpha: 0.3,
            color: c,
          });
        }
      }
      if (Math.random() < 0.5) {
        c.setRGB(0.85, 0.7, 0.55);
        this.dust.emit({
          pos: focus.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, Math.random() * 4, (Math.random() - 0.5) * 40)),
          vel: new THREE.Vector3(1.4 + Math.random(), (Math.random() - 0.3) * 0.2, 0.6 + Math.random() * 0.5),
          life: 6,
          size: 0.08 + Math.random() * 0.08,
          alpha: 0.5,
          color: c,
        });
      }
    }
    this.fire.update(dt);
    this.smoke.update(dt);
    this.dust.update(dt);
  }
}
