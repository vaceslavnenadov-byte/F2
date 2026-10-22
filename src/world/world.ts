import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm } from '../core/noise';
import { mulberry32 } from '../core/math';
import { ParticleSystem } from '../engine/particles';
import { DOG_SPOT, NEST, PEN, TEMPLE, VILLAGE, WORLD_SIZE } from './config';
import { NavGrid } from './nav';
import { buildTerrain, heightAt } from './terrain';
import { createTextures, type DetailTextures } from './textures';

export interface Interactable {
  id: string;
  name: string;
  object: THREE.Object3D;
  /** Точка, к которой подходит игрок. */
  approach: THREE.Vector3;
}

/** Смещает вершины шумом от их позиции — общие вершины смещаются одинаково, щелей нет. */
function jitter(geo: THREE.BufferGeometry, amount: number, freq: number, seed: number): THREE.BufferGeometry {
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

function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 6): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  geo.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  geo.applyQuaternion(q);
  geo.translate(a.x, a.y, a.z);
  return geo;
}

export class World {
  readonly group = new THREE.Group();
  readonly nav: NavGrid;
  readonly terrain: THREE.Mesh;
  readonly interactables: Interactable[] = [];
  readonly fire = new ParticleSystem(500, THREE.AdditiveBlending, -1.2, 0.6);
  readonly smoke = new ParticleSystem(300, THREE.NormalBlending, -0.15, 0.3);
  readonly dust = new ParticleSystem(400, THREE.NormalBlending, 0, 0);
  private readonly tex: DetailTextures;
  private readonly timeUniform = { value: 0 };
  private readonly flames: { pos: THREE.Vector3; light: THREE.PointLight; base: number; scale: number }[] = [];
  private readonly rnd = mulberry32(2241);
  private fireAcc = 0;

  readonly mat: Record<string, THREE.MeshStandardMaterial>;

  constructor() {
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
    this.mat = {
      mud: new THREE.MeshStandardMaterial({ color: '#a27a58', map: mudMap, normalMap: rockNormal, roughness: 0.95 }),
      thatch: new THREE.MeshStandardMaterial({ color: '#d8bf86', map: thatch, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ color: '#8a6a50', map: wood, roughness: 0.9 }),
      darkWood: new THREE.MeshStandardMaterial({ color: '#4a3526', map: wood, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: '#a39282', normalMap: rockNormal, roughness: 0.92 }),
      rock: new THREE.MeshStandardMaterial({ color: '#9a7058', normalMap: rockNormal, roughness: 0.95 }),
      bone: new THREE.MeshStandardMaterial({ color: '#e6dcc4', roughness: 0.7 }),
      void: new THREE.MeshStandardMaterial({ color: '#070504', roughness: 1 }),
      clay: new THREE.MeshStandardMaterial({ color: '#a8603e', roughness: 0.8 }),
      paintRed: new THREE.MeshStandardMaterial({ color: '#8e2f22', map: wood, roughness: 0.85 }),
      paintBlue: new THREE.MeshStandardMaterial({ color: '#2f5a74', map: wood, roughness: 0.85 }),
      plant: new THREE.MeshStandardMaterial({ color: '#6f7a45', roughness: 0.9 }),
      egg: new THREE.MeshStandardMaterial({ color: '#d9cfa8', roughness: 0.5 }),
    };

    this.buildVillage();
    this.buildTemple();
    this.buildNest();
    this.buildDogSpot();
    this.scatterRocks();
    this.scatterTrees();
    this.scatterGrass();
    this.group.add(this.fire.points, this.smoke.points, this.dust.points);
  }

  private y(x: number, z: number) { return heightAt(x, z); }

  private place(obj: THREE.Object3D, x: number, z: number, rotY = 0, sink = 0.1) {
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

  // ─── Деревня ──────────────────────────────────────────────────────────────

  private hut(r: number, h: number, seed: number): THREE.Group {
    const g = new THREE.Group();
    const walls = jitter(new THREE.CylinderGeometry(r, r * 1.08, h, 28, 4), 0.25, 0.8, seed);
    const wallMesh = new THREE.Mesh(walls, this.mat.mud);
    wallMesh.position.y = h / 2;
    g.add(wallMesh);
    const roofGeo = jitter(new THREE.ConeGeometry(r * 1.42, h * 1.05, 28, 5), 0.35, 0.6, seed + 5);
    const roof = new THREE.Mesh(roofGeo, this.mat.thatch);
    roof.position.y = h + h * 0.45;
    g.add(roof);
    // Пучок стеблей на макушке крыши.
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 6), this.mat.darkWood);
    tip.position.y = h + h * 1.05;
    g.add(tip);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.5), this.mat.void);
    door.position.set(0, 0.85, r * 0.95);
    g.add(door);
    // Обрамление входа.
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

  private pot(): THREE.Mesh {
    const pts = [
      [0.0, 0], [0.18, 0], [0.26, 0.12], [0.3, 0.3], [0.24, 0.48], [0.14, 0.56], [0.16, 0.62],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 14), this.mat.clay);
  }

  private totem(): THREE.Group {
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

  private addFlame(pos: THREE.Vector3, intensity: number, scale: number) {
    const light = new THREE.PointLight(0xff8a3a, intensity, 16, 1.6);
    light.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
    this.group.add(light);
    this.flames.push({ pos, light, base: intensity, scale });
  }

  private torch(x: number, z: number) {
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

  private buildVillage() {
    const { x: vx, z: vz } = VILLAGE;
    const huts = [
      { x: 0, z: -17, r: 4.2, h: 3.0 },
      { x: -14, z: -8, r: 2.8, h: 2.4 },
      { x: 14, z: -9, r: 2.8, h: 2.4 },
      { x: -17, z: 7, r: 3.0, h: 2.5 },
      { x: 16, z: 9, r: 2.6, h: 2.3 },
      { x: -7, z: 16, r: 2.5, h: 2.3 },
      { x: 8, z: 17, r: 2.7, h: 2.4 },
    ];
    huts.forEach((hd, i) => {
      const x = vx + hd.x;
      const z = vz + hd.z;
      const hut = this.hut(hd.r, hd.h, i * 13 + 3);
      this.place(hut, x, z, Math.atan2(vx - x, vz - z), 0.15);
      this.nav.blockCircle(x, z, hd.r + 0.4);
      // Горшки у стен.
      for (let k = 0; k < 2; k++) {
        const a = Math.atan2(vx - x, vz - z) + (k ? 0.9 : -0.9);
        const p = this.pot();
        p.scale.setScalar(0.8 + this.rnd() * 0.6);
        this.place(p, x + Math.sin(a) * (hd.r + 0.5), z + Math.cos(a) * (hd.r + 0.5), this.rnd() * 6, 0.02);
      }
    });

    // Костёр в центре.
    const fire = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.22, 1), 0.12, 3, i), this.mat.stone);
      s.position.set(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85);
      fire.add(s);
    }
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), this.mat.darkWood);
      log.rotation.z = Math.PI / 2 - 0.5;
      log.rotation.y = (i / 4) * Math.PI * 2;
      log.position.y = 0.3;
      const holder = new THREE.Group();
      holder.add(log);
      holder.rotation.y = (i / 4) * Math.PI;
      fire.add(holder);
    }
    this.place(fire, vx, vz, 0, 0);
    this.addFlame(new THREE.Vector3(vx, this.y(vx, vz) + 0.3, vz), 30, 1);
    this.nav.blockCircle(vx, vz, 1.3);
    // Брёвна-скамьи вокруг костра.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 2.2, 8), this.mat.wood);
      bench.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(bench);
      const bx = vx + Math.cos(a) * 3.6;
      const bz = vz + Math.sin(a) * 3.6;
      this.place(holder, bx, bz, -a + Math.PI / 2, -0.15);
      this.nav.blockRect(bx, bz, 1.0, 0.3, -a + Math.PI / 2);
    }

    // Частокол с проходами на восток (гнездо), север (храм), северо-запад (пёс) и юг.
    const gaps = [0, -Math.PI / 2, Math.atan2(DOG_SPOT.z, DOG_SPOT.x), Math.PI / 2];
    const R = 26;
    const postGeo = new THREE.CylinderGeometry(0.09, 0.12, 1, 6);
    const postsMatrices: THREE.Matrix4[] = [];
    const steps = Math.floor((Math.PI * 2 * R) / 0.55);
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2 - Math.PI;
      if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.13)) continue;
      const x = vx + Math.cos(a) * R;
      const z = vz + Math.sin(a) * R;
      const h = 1.6 + this.rnd() * 0.7;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, this.y(x, z) + h / 2 - 0.15, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rnd() - 0.5) * 0.12, 0, (this.rnd() - 0.5) * 0.12)),
        new THREE.Vector3(1, h, 1),
      );
      postsMatrices.push(m);
      this.nav.blockCircle(x, z, 0.5);
    }
    const posts = new THREE.InstancedMesh(postGeo, this.mat.wood, postsMatrices.length);
    postsMatrices.forEach((m, i) => posts.setMatrixAt(i, m));
    posts.castShadow = posts.receiveShadow = true;
    this.group.add(posts);
    // Тотемы и факелы у проходов.
    for (const g of gaps) {
      for (const side of [-1, 1]) {
        const a = g + side * 0.19;
        const tx = vx + Math.cos(a) * (R + 0.2);
        const tz = vz + Math.sin(a) * (R + 0.2);
        this.place(this.totem(), tx, tz, -a + Math.PI / 2, 0.05);
        this.nav.blockCircle(tx, tz, 0.6);
      }
      this.torch(vx + Math.cos(g + 0.3) * (R - 1.2), vz + Math.sin(g + 0.3) * (R - 1.2));
    }

    // Загон для брамінов.
    const pen = new THREE.Group();
    const pw = 4.5;
    const pd = 4.5;
    const rail = (ax: number, az: number, bx: number, bz: number) => {
      for (const y of [0.55, 1.05]) {
        pen.add(new THREE.Mesh(cylinderBetween(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz), 0.05, 0.05), this.mat.wood));
      }
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
      for (let i = 0; i <= n; i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6), this.mat.darkWood);
        p.position.set(ax + ((bx - ax) * i) / n, 0.6, az + ((bz - az) * i) / n);
        pen.add(p);
      }
    };
    rail(-pw, -pd, pw, -pd);
    rail(pw, -pd, pw, pd);
    rail(pw, pd, -pw, pd);
    rail(-pw, pd, -pw, -pd);
    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.5), this.mat.darkWood);
    trough.position.set(0, 0.18, -pd + 0.6);
    pen.add(trough);
    this.place(pen, PEN.x, PEN.z, 0, 0.1);
    for (const [ax, az, bx, bz] of [[-pw, -pd, pw, -pd], [pw, -pd, pw, pd], [pw, pd, -pw, pd], [-pw, pd, -pw, -pd]]) {
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
      for (let i = 0; i <= n; i++) {
        this.nav.blockCircle(PEN.x + ax + ((bx - ax) * i) / n, PEN.z + az + ((bz - az) * i) / n, 0.5);
      }
    }

    // Огород шамана.
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 5; k++) {
        const bush = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.3, 1), 0.15, 3, row * 5 + k), this.mat.plant);
        bush.scale.set(1, 0.7 + this.rnd() * 0.4, 1);
        this.place(bush, 9 + k * 0.9, -1.5 + row * 1.1, this.rnd() * 6, -0.15);
      }
    }
  }

  // ─── Храм Испытаний ───────────────────────────────────────────────────────

  private buildTemple() {
    const { x, z } = TEMPLE;
    const g = new THREE.Group();
    const s = this.mat.stone;
    const box = (w: number, h: number, d: number, px: number, py: number, pz: number, m: THREE.Material = s, j = 0.08) => {
      const mesh = new THREE.Mesh(jitter(new THREE.BoxGeometry(w, h, d, 6, 4, 6), j, 1.2, Math.floor(px * 7 + py * 3)), m);
      mesh.position.set(px, py, pz);
      g.add(mesh);
      return mesh;
    };
    box(17, 0.8, 13, 0, 0.4, 0);
    box(13, 6, 8, 0, 3.8, -1.5);
    box(10, 1.4, 6.5, 0, 7.5, -1.5);
    box(6, 1.2, 4.5, 0, 8.8, -1.5);
    box(3.2, 3.8, 0.6, 0, 2.7, 2.35, this.mat.void, 0);
    // Колонны и антаблемент.
    for (const cx of [-5.4, -3.2, 3.2, 5.4]) {
      const col = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.45, 0.55, 5.2, 12, 4), 0.07, 2, cx * 10), s);
      col.position.set(cx, 3.4, 4.6);
      g.add(col);
    }
    box(13.2, 0.9, 1.6, 0, 6.3, 4.6);
    // Ступени.
    for (let i = 0; i < 3; i++) box(6 - i * 0.6, 0.3, 1, 0, 0.15 + i * 0.3 - 0.3, 7 - i * 0.8, s, 0.03);
    // Обломки.
    const piece = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.5, 0.55, 1.6, 12), 0.1, 2, 4), s);
    piece.rotation.z = Math.PI / 2;
    piece.position.set(7.5, 0.5, 6);
    g.add(piece);
    this.place(g, x, z, 0, 0.35);
    this.nav.blockRect(x, z - 0.5, 8.6, 6.2);
    this.interactables.push({
      id: 'temple',
      name: 'Храм Испытаний',
      object: g,
      approach: new THREE.Vector3(x, 0, z + 9),
    });
  }

  // ─── Гнездо гекконов и место, где прячется пёс ────────────────────────────

  private boulder(scale: THREE.Vector3, seed: number): THREE.Mesh {
    const m = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(1, 2), 0.6, 0.9, seed), this.mat.rock);
    m.scale.copy(scale);
    return m;
  }

  private buildNest() {
    const { x, z } = NEST;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.5) continue; // вход с запада
      const r = 8 + this.rnd() * 1.5;
      const s = 1.2 + this.rnd() * 1.2;
      const bx = x + Math.cos(a) * r;
      const bz = z + Math.sin(a) * r;
      this.place(this.boulder(new THREE.Vector3(s, s * 0.8, s), i + 40), bx, bz, this.rnd() * 6, s * 0.3);
      this.nav.blockCircle(bx, bz, s * 0.9);
    }
    // Кладка яиц и кости.
    for (let i = 0; i < 7; i++) {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this.mat.egg);
      egg.scale.set(1, 1.35, 1);
      this.place(egg, x + 2 + (this.rnd() - 0.5) * 1.2, z - 1 + (this.rnd() - 0.5) * 1.2, 0, -0.12);
    }
    for (let i = 0; i < 8; i++) {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6 + this.rnd() * 0.4, 5), this.mat.bone);
      bone.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(bone);
      this.place(holder, x + (this.rnd() - 0.5) * 9, z + (this.rnd() - 0.5) * 9, this.rnd() * 6, -0.03);
    }
    const skull = new THREE.Group();
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), this.mat.bone);
    cranium.scale.set(1, 0.8, 1.4);
    skull.add(cranium);
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 8), this.mat.bone);
      horn.position.set(sx * 0.45, 0.2, 0);
      horn.rotation.z = -sx * 1.1;
      skull.add(horn);
    }
    this.place(skull, x - 3, z + 3, 0.7, -0.1);
  }

  private buildDogSpot() {
    const { x, z } = DOG_SPOT;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const s = 1 + this.rnd();
      const bx = x + Math.cos(a) * 5;
      const bz = z + Math.sin(a) * 5;
      if (i === 1) continue;
      this.place(this.boulder(new THREE.Vector3(s, s * 0.7, s * 1.2), i + 70), bx, bz, this.rnd() * 6, s * 0.25);
      this.nav.blockCircle(bx, bz, s * 0.9);
    }
  }

  // ─── Рассыпка окружения ───────────────────────────────────────────────────

  private isReserved(x: number, z: number, pad = 0): boolean {
    const zones = [
      { x: VILLAGE.x, z: VILLAGE.z, r: 29 },
      { x: TEMPLE.x, z: TEMPLE.z, r: 13 },
      { x: NEST.x, z: NEST.z, r: 10 },
      { x: DOG_SPOT.x, z: DOG_SPOT.z, r: 6 },
    ];
    return zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + pad);
  }

  private scatterRocks() {
    const geos = [0, 1, 2].map((i) => jitter(new THREE.IcosahedronGeometry(1, 2), 0.7, 0.8, 100 + i));
    for (let gi = 0; gi < geos.length; gi++) {
      const matrices: THREE.Matrix4[] = [];
      for (let n = 0; n < 140; n++) {
        const x = (this.rnd() - 0.5) * (WORLD_SIZE - 10);
        const z = (this.rnd() - 0.5) * (WORLD_SIZE - 10);
        const big = this.rnd() < 0.22;
        if (this.isReserved(x, z, big ? 3 : 0)) continue;
        const s = big ? 1.1 + this.rnd() * 1.6 : 0.15 + this.rnd() * 0.4;
        const sc = new THREE.Vector3(s * (0.8 + this.rnd() * 0.5), s * (0.5 + this.rnd() * 0.4), s * (0.8 + this.rnd() * 0.5));
        matrices.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, this.y(x, z) - sc.y * 0.25, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rnd() * 0.3, this.rnd() * 6.28, this.rnd() * 0.3)),
            sc,
          ),
        );
        if (big) this.nav.blockCircle(x, z, Math.max(sc.x, sc.z) * 0.85);
      }
      const im = new THREE.InstancedMesh(geos[gi], this.mat.rock, matrices.length);
      matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = im.receiveShadow = true;
      this.group.add(im);
    }
  }

  private deadTreeGeometry(seed: number): THREE.BufferGeometry {
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

  private scatterTrees() {
    const geos = [1, 2, 3].map((s) => this.deadTreeGeometry(s * 31));
    let placed = 0;
    for (let n = 0; n < 200 && placed < 34; n++) {
      const x = (this.rnd() - 0.5) * (WORLD_SIZE - 16);
      const z = (this.rnd() - 0.5) * (WORLD_SIZE - 16);
      if (this.isReserved(x, z, 2)) continue;
      const [i, j] = this.nav.cellOf(x, z);
      if (!this.nav.isWalkable(i, j)) continue;
      const tree = new THREE.Mesh(geos[placed % 3], this.mat.darkWood);
      tree.scale.setScalar(0.8 + this.rnd() * 0.7);
      this.place(tree, x, z, this.rnd() * 6, 0);
      this.nav.blockCircle(x, z, 0.5);
      placed++;
    }
    // Пара деревьев в деревне для уюта.
    for (const [x, z] of [[-9, -12], [12, 3], [-4, 22]]) {
      const tree = new THREE.Mesh(geos[0], this.mat.darkWood);
      tree.scale.setScalar(1.3);
      this.place(tree, x, z, x, 0);
      this.nav.blockCircle(x, z, 0.5);
    }
  }

  private scatterGrass() {
    // Пучок сухой травы: несколько изогнутых травинок.
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
    for (let n = 0; n < 4200; n++) {
      const x = (this.rnd() - 0.5) * (WORLD_SIZE - 12);
      const z = (this.rnd() - 0.5) * (WORLD_SIZE - 12);
      if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 7) continue;
      // Трава растёт пятнами.
      if (fbm(x * 0.07, z * 0.07, 3, 400) < 0.45) continue;
      const [i, j] = this.nav.cellOf(x, z);
      if (!this.nav.inBounds(i, j) || this.nav.blocked[this.nav.idx(i, j)]) continue;
      const s = 0.7 + this.rnd() * 0.9;
      matrices.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, this.y(x, z) - 0.03, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rnd() * 6.28, 0)),
          new THREE.Vector3(s, s * (0.8 + this.rnd() * 0.5), s),
        ),
      );
      colors.push(new THREE.Color().setHSL(0.1 + this.rnd() * 0.04, 0.35 + this.rnd() * 0.2, 0.42 + this.rnd() * 0.15));
    }
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, colors[i]);
    });
    im.receiveShadow = true;
    this.group.add(im);
  }

  // ─── Анимация мира ────────────────────────────────────────────────────────

  update(dt: number, time: number, focus: THREE.Vector3) {
    this.timeUniform.value = time;
    this.fireAcc += dt;
    const c = new THREE.Color();
    while (this.fireAcc > 1 / 60) {
      this.fireAcc -= 1 / 60;
      for (const f of this.flames) {
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
        f.light.intensity = f.base * (0.8 + Math.random() * 0.35);
      }
      // Пыль, несомая ветром вокруг камеры.
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
