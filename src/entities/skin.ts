import * as THREE from 'three';
import { lerp } from '../core/math';

/** Влияния костей на вершину: [имя кости, вес]. */
export type Weights = [string, number][];

export interface TubeOpts {
  from: THREE.Vector3;
  to: THREE.Vector3;
  r0: number;
  r1: number;
  /** Профиль радиуса вдоль трубки (перекрывает линейный r0→r1). */
  radius?: (t: number) => number;
  /** Сплющивание сечения по двум осям. */
  squash?: [number, number];
  weights: (t: number) => Weights;
  color: (t: number, dir: THREE.Vector3) => THREE.Color;
  rings?: number;
  radial?: number;
  caps?: boolean;
}

/** Плавное перетекание веса с кости a на кость b на участке [t0, t1]. */
export function blend(a: string, b: string, t0: number, t1: number) {
  return (t: number): Weights => {
    const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    return [[a, 1 - k], [b, k]];
  };
}

export const only = (a: string) => (): Weights => [[a, 1]];

/**
 * Сборщик процедурного скиннинг-меша: кости + «трубки» и эллипсоиды с весами.
 * Сочленения сглаживаются за счёт смешивания весов соседних костей.
 */
export class SkinBuilder {
  private bones: THREE.Bone[] = [];
  private index = new Map<string, number>();
  private world = new Map<string, THREE.Vector3>();
  private P: number[] = [];
  private C: number[] = [];
  private SI: number[] = [];
  private SW: number[] = [];
  private I: number[] = [];
  private attachments: { bone: string; obj: THREE.Object3D; at: THREE.Vector3 }[] = [];

  bone(name: string, parent: string | null, at: THREE.Vector3): this {
    const b = new THREE.Bone();
    b.name = name;
    const pw = parent ? this.world.get(parent)! : new THREE.Vector3();
    b.position.copy(at).sub(pw);
    if (parent) this.bones[this.index.get(parent)!].add(b);
    this.index.set(name, this.bones.length);
    this.bones.push(b);
    this.world.set(name, at.clone());
    return this;
  }

  /** Немешевой объект (оружие, глаза, рога), прикреплённый к кости в точке модели. */
  attach(bone: string, obj: THREE.Object3D, at: THREE.Vector3) {
    this.attachments.push({ bone, obj, at });
  }

  private vertex(p: THREE.Vector3, c: THREE.Color, w: Weights) {
    this.P.push(p.x, p.y, p.z);
    this.C.push(c.r, c.g, c.b);
    const ws = w.filter((x) => x[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = ws.reduce((s, x) => s + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      if (k < ws.length) {
        this.SI.push(this.index.get(ws[k][0])!);
        this.SW.push(ws[k][1] / sum);
      } else {
        this.SI.push(0);
        this.SW.push(0);
      }
    }
  }

  tube(o: TubeOpts) {
    const rings = o.rings ?? 6;
    const radial = o.radial ?? 14;
    const [sx, sy] = o.squash ?? [1, 1];
    const d = o.to.clone().sub(o.from);
    const L = d.length();
    d.normalize();
    const ref = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const side = d.clone().cross(ref).normalize();
    const up = side.clone().cross(d).normalize();
    const rad = (t: number) => (o.radius ? o.radius(t) : lerp(o.r0, o.r1, t));
    const samples: { s: number; r: number; t: number }[] = [];
    const caps = o.caps ?? true;
    const CAP = 3;
    if (caps) {
      for (let k = 0; k < CAP; k++) {
        const th = (Math.PI / 2) * (k / CAP);
        samples.push({ s: -rad(0) * Math.cos(th) * 0.8, r: rad(0) * Math.sin(th), t: 0 });
      }
    }
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      samples.push({ s: t * L, r: rad(t), t });
    }
    if (caps) {
      for (let k = CAP - 1; k >= 0; k--) {
        const th = (Math.PI / 2) * (k / CAP);
        samples.push({ s: L + rad(1) * Math.cos(th) * 0.8, r: rad(1) * Math.sin(th), t: 1 });
      }
    }
    const base = this.P.length / 3;
    const dir = new THREE.Vector3();
    for (const smp of samples) {
      const w = o.weights(smp.t);
      for (let a = 0; a < radial; a++) {
        const ang = (a / radial) * Math.PI * 2;
        dir.copy(side).multiplyScalar(Math.cos(ang) * sx).addScaledVector(up, Math.sin(ang) * sy);
        const p = o.from.clone().addScaledVector(d, smp.s).addScaledVector(dir, smp.r);
        this.vertex(p, o.color(smp.t, dir.clone().normalize()), w);
      }
    }
    for (let r = 0; r < samples.length - 1; r++) {
      for (let a = 0; a < radial; a++) {
        const a2 = (a + 1) % radial;
        const i0 = base + r * radial + a;
        const i1 = base + r * radial + a2;
        const i2 = base + (r + 1) * radial + a;
        const i3 = base + (r + 1) * radial + a2;
        this.I.push(i0, i2, i1, i1, i2, i3);
      }
    }
  }

  ellipsoid(center: THREE.Vector3, radii: THREE.Vector3, w: Weights, color: (n: THREE.Vector3) => THREE.Color, seg: [number, number] = [16, 12]) {
    const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const base = this.P.length / 3;
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      n.fromBufferAttribute(pos, i);
      const p = new THREE.Vector3(n.x * radii.x, n.y * radii.y, n.z * radii.z).add(center);
      this.vertex(p, color(n), w);
    }
    for (const i of g.index!.array) this.I.push(base + i);
    g.dispose();
  }

  build(material: THREE.Material): { mesh: THREE.SkinnedMesh; bone: (name: string) => THREE.Bone } {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    geo.setIndex(this.I);
    geo.computeVertexNormals();
    const mesh = new THREE.SkinnedMesh(geo, material);
    for (const b of this.bones) if (!b.parent) mesh.add(b);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Поза меняется сильно (падение), так что не отсекаем по исходной сфере.
    mesh.frustumCulled = false;
    const bone = (name: string) => this.bones[this.index.get(name)!];
    for (const a of this.attachments) {
      a.obj.position.copy(a.at).sub(this.world.get(a.bone)!);
      bone(a.bone).add(a.obj);
      a.obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
    }
    return { mesh, bone };
  }
}

// ─── Анимационные клипы из ключевых кадров ──────────────────────────────────

/** [время, rx, ry, rz] — поворот кости относительно позы привязки (у нас она нулевая). */
export type RotKey = [number, number, number, number];
/** [время, x, y, z] — абсолютная локальная позиция кости. */
export type PosKey = [number, number, number, number];

export function makeClip(name: string, duration: number, rot: Record<string, RotKey[]>, pos: Record<string, PosKey[]> = {}): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [bone, keys] of Object.entries(rot)) {
    const times: number[] = [];
    const values: number[] = [];
    for (const [t, x, y, z] of keys) {
      times.push(t);
      q.setFromEuler(e.set(x, y, z));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  for (const [bone, keys] of Object.entries(pos)) {
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, keys.map((k) => k[0]), keys.flatMap((k) => [k[1], k[2], k[3]])));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Синусоидальная дорожка для циклов: n ключей, значение amp·sin(2π(t/dur) + phase) + offset по выбранной оси. */
export function sineKeys(dur: number, axis: 0 | 1 | 2, amp: number, phase = 0, offset = 0, n = 8, extra: [number, number, number] = [0, 0, 0]): RotKey[] {
  const keys: RotKey[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur;
    const v = offset + amp * Math.sin((i / n) * Math.PI * 2 + phase);
    const k: RotKey = [t, extra[0], extra[1], extra[2]];
    k[1 + axis] += v;
    keys.push(k);
  }
  return keys;
}
