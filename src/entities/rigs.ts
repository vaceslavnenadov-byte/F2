import * as THREE from 'three';
import { clamp, easeInOut, lerp } from '../core/math';

/** Процедурная модель с анимацией: ходьба, атака, получение урона, смерть. Смотрит вдоль +Z. */
export abstract class Rig {
  readonly root = new THREE.Group();
  /** Внутренний контейнер — его поворачиваем при падении, не трогая позицию актёра. */
  protected readonly body = new THREE.Group();
  protected phase = 0;
  protected moveBlend = 0;
  protected attackT = -1;
  protected hitT = -1;
  protected deathT = -1;
  protected time = Math.random() * 10;
  abstract readonly height: number;
  /** Длина шага — согласует частоту ног со скоростью. */
  protected stride = 1.2;

  constructor() {
    this.root.add(this.body);
  }

  playAttack() { this.attackT = 0; }
  playHit() { if (this.deathT < 0) this.hitT = 0; }
  playDeath() { this.deathT = 0; }
  get isDead() { return this.deathT >= 0; }

  update(dt: number, speed: number) {
    this.time += dt;
    this.moveBlend = lerp(this.moveBlend, speed > 0.05 ? 1 : 0, clamp(dt * 8, 0, 1));
    this.phase += (dt * speed * Math.PI) / this.stride;
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (this.attackT > 0.55) this.attackT = -1;
    }
    if (this.hitT >= 0) {
      this.hitT += dt;
      if (this.hitT > 0.35) this.hitT = -1;
    }
    if (this.deathT >= 0) this.deathT = Math.min(1, this.deathT + dt * 1.6);
    this.pose();
  }

  /** Кривая атаки: быстрый выпад, медленный возврат. 0..1..0 */
  protected attackCurve(): number {
    if (this.attackT < 0) return 0;
    const t = this.attackT / 0.55;
    return t < 0.3 ? easeInOut(t / 0.3) : 1 - easeInOut((t - 0.3) / 0.7);
  }

  protected hitCurve(): number {
    return this.hitT < 0 ? 0 : Math.sin((this.hitT / 0.35) * Math.PI);
  }

  protected abstract pose(): void;

  protected shadows() {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }
}

function std(color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function capsule(r: number, len: number, mat: THREE.Material, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.position.y = y;
  return m;
}

// ─── Человек ────────────────────────────────────────────────────────────────

export type WeaponVisual = 'none' | 'spear' | 'gun' | 'staff';

export interface HumanoidLook {
  skin: THREE.ColorRepresentation;
  cloth: THREE.ColorRepresentation;
  hair: THREE.ColorRepresentation;
  /** Накидка/жилет. */
  top?: THREE.ColorRepresentation;
  beard?: boolean;
  build?: number;
  scale?: number;
}

export class HumanoidRig extends Rig {
  readonly height: number;
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  private weaponHolder = new THREE.Group();
  private weapons: Record<WeaponVisual, THREE.Object3D | null>;
  private weapon: WeaponVisual = 'none';

  constructor(look: HumanoidLook) {
    super();
    const scale = look.scale ?? 1;
    const build = look.build ?? 1;
    this.height = 1.8 * scale;
    this.stride = 1.1;
    const skin = std(look.skin, 0.65);
    const cloth = std(look.cloth, 0.95);
    const hair = std(look.hair, 0.9);
    const leather = std('#5a3e2a', 0.85);

    this.body.scale.setScalar(scale);
    this.body.add(this.hips);
    this.hips.position.y = 0.95;

    // Ноги с коленным суставом.
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.11, 0, 0);
      hip.add(capsule(0.075 * build, 0.34, skin, -0.22));
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      knee.add(capsule(0.06 * build, 0.34, skin, -0.21));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), leather);
      foot.position.set(0, -0.45, 0.05);
      knee.add(foot);
      hip.add(knee);
      this.hips.add(hip);
      this.legs.push({ hip, knee });
    }
    // Набедренная повязка.
    const loin = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * build, 0.24 * build, 0.28, 12), cloth);
    loin.position.y = -0.06;
    this.hips.add(loin);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.03), cloth);
    flap.position.set(0, -0.25, 0.19 * build);
    this.hips.add(flap);

    this.hips.add(this.torso);
    const chest = capsule(0.17, 0.28, skin, 0.3);
    chest.scale.set(1.25 * build, 1, 0.8 * build);
    this.torso.add(chest);
    if (look.top) {
      const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.23 * build, 0.21 * build, 0.42, 12, 1, true), std(look.top, 0.9));
      vest.material.side = THREE.DoubleSide;
      vest.scale.set(1.1, 1, 0.82);
      vest.position.y = 0.33;
      this.torso.add(vest);
    }
    // Ремень через плечо.
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.21 * build, 0.02, 4, 16), leather);
    strap.scale.set(1.1, 1.5, 0.7);
    strap.rotation.set(0, Math.PI / 2, 0.6);
    strap.position.y = 0.32;
    this.torso.add(strap);

    // Голова.
    this.head.position.y = 0.68;
    this.torso.add(this.head);
    const neck = capsule(0.055, 0.08, skin, -0.06);
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
    skull.scale.set(0.95, 1.1, 1);
    skull.position.y = 0.08;
    this.head.add(skull);
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairMesh.position.set(0, 0.1, -0.01);
    hairMesh.rotation.x = -0.25;
    this.head.add(hairMesh);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 5), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.07, 0.115);
    this.head.add(nose);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), std('#120c08', 0.3));
      eye.position.set(sx * 0.04, 0.1, 0.1);
      this.head.add(eye);
    }
    if (look.beard) {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), hair);
      beard.rotation.x = Math.PI;
      beard.position.set(0, -0.02, 0.06);
      this.head.add(beard);
    }

    // Руки.
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.25 * build, 0.48, 0);
      shoulder.rotation.z = side * 0.08;
      shoulder.add(capsule(0.055 * build, 0.24, skin, -0.15));
      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      elbow.add(capsule(0.048 * build, 0.22, skin, -0.14));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.06, 8), leather);
      band.position.y = -0.2;
      elbow.add(band);
      shoulder.add(elbow);
      this.torso.add(shoulder);
      this.arms.push({ shoulder, elbow });
    }
    this.weaponHolder.position.y = -0.3;
    this.arms[1].elbow.add(this.weaponHolder);

    // Оружие.
    const wood = std('#6a4a30', 0.85);
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 2.1, 6), wood);
    shaft.position.y = 0.45;
    spear.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), std('#3a3634', 0.35, 0.3));
    tip.position.y = 1.6;
    spear.add(tip);
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), std('#3c3c3e', 0.4, 0.8));
    barrel.position.y = -0.18;
    gun.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.09), std('#4a3424', 0.7));
    grip.position.set(0, -0.02, -0.05);
    gun.add(grip);
    const staff = new THREE.Group();
    const staffShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.8, 6), wood);
    staffShaft.position.y = 0.35;
    staff.add(staffShaft);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), std('#e6dcc4', 0.6));
    orb.position.y = 1.28;
    staff.add(orb);
    this.weapons = { none: null, spear, gun, staff };
    for (const w of [spear, gun, staff]) {
      w.visible = false;
      this.weaponHolder.add(w);
    }

    this.shadows();
  }

  setWeapon(w: WeaponVisual) {
    this.weapon = w;
    for (const [k, obj] of Object.entries(this.weapons)) if (obj) obj.visible = k === w;
  }

  protected pose() {
    const b = this.moveBlend;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const atk = this.attackCurve();
    const hit = this.hitCurve();
    const breath = Math.sin(this.time * 1.8) * 0.015;

    this.legs[0].hip.rotation.x = s * 0.55 * b;
    this.legs[1].hip.rotation.x = -s * 0.55 * b;
    this.legs[0].knee.rotation.x = Math.max(0, -c) * 0.9 * b;
    this.legs[1].knee.rotation.x = Math.max(0, c) * 0.9 * b;
    this.hips.position.y = 0.95 + Math.abs(c) * 0.04 * b - 0.03 * b;

    this.torso.rotation.x = 0.06 * b + breath - hit * 0.3;
    this.torso.rotation.y = s * 0.08 * b;
    this.head.rotation.x = -0.05 * b + hit * 0.2;

    const [left, right] = this.arms;
    left.shoulder.rotation.x = -s * 0.5 * b;
    left.elbow.rotation.x = -0.25 - 0.2 * b;

    if (this.weapon === 'gun') {
      // Прицеливание: рука вытянута вперёд, отдача при выстреле.
      right.shoulder.rotation.x = lerp(s * 0.4 * b - 0.1, -1.5, atk > 0 ? 1 : 0) + atk * 0.25;
      right.elbow.rotation.x = atk > 0 ? -0.05 : -0.35;
      this.weaponHolder.rotation.x = 0;
    } else if (this.weapon === 'spear' || this.weapon === 'staff') {
      right.shoulder.rotation.x = lerp(-0.25 + s * 0.15 * b, -1.25, atk);
      right.elbow.rotation.x = lerp(-0.55, -0.05, atk);
      // При выпаде копьё разворачивается остриём к цели.
      this.weaponHolder.rotation.x = lerp(0.8, Math.PI / 2 + 1.3, atk);
      this.torso.rotation.y += atk * 0.35;
    } else {
      right.shoulder.rotation.x = lerp(s * 0.5 * b, -1.45, atk);
      right.elbow.rotation.x = lerp(-0.25 - 0.2 * b, -0.05, atk);
    }
    this.torso.rotation.x += atk * 0.12;

    if (this.deathT >= 0) {
      const e = easeInOut(this.deathT);
      this.body.rotation.x = -Math.PI / 2 * e;
      this.body.position.y = 0.12 * e;
      this.body.position.z = -0.3 * e;
    }
  }
}

// ─── Ящер (геккон) ──────────────────────────────────────────────────────────

export class LizardRig extends Rig {
  readonly height: number;
  private trunk = new THREE.Group();
  private headG = new THREE.Group();
  private jaw: THREE.Mesh;
  private tail: THREE.Group[] = [];
  private legs: THREE.Group[] = [];

  constructor(color: THREE.ColorRepresentation, belly: THREE.ColorRepresentation, scale = 1) {
    super();
    this.height = 0.7 * scale;
    this.stride = 0.5;
    const skin = std(color, 0.55);
    skin.metalness = 0.05;
    const bellyMat = std(belly, 0.7);
    this.body.scale.setScalar(scale);
    this.body.add(this.trunk);
    this.trunk.position.y = 0.36;

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), skin);
    torso.scale.set(0.95, 0.75, 1.7);
    this.trunk.add(torso);
    const bellyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), bellyMat);
    bellyMesh.scale.set(0.85, 0.6, 1.55);
    bellyMesh.position.y = -0.06;
    this.trunk.add(bellyMesh);
    // Гребень вдоль спины.
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), bellyMat);
      spike.position.set(0, 0.22, -0.35 + i * 0.14);
      spike.rotation.x = -0.4;
      this.trunk.add(spike);
    }

    this.headG.position.set(0, 0.1, 0.52);
    this.trunk.add(this.headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
    head.scale.set(1, 0.75, 1.5);
    head.position.z = 0.12;
    this.headG.add(head);
    this.jaw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bellyMat);
    this.jaw.scale.set(1, 0.4, 1.5);
    this.jaw.position.set(0, -0.08, 0.12);
    this.headG.add(this.jaw);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: '#f2c230', emissive: '#7a5200', emissiveIntensity: 0.6, roughness: 0.2 }));
      eye.position.set(sx * 0.11, 0.06, 0.18);
      this.headG.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), std('#000', 0.2));
      pupil.position.set(sx * 0.135, 0.065, 0.205);
      this.headG.add(pupil);
    }

    // Хвост — цепочка сегментов, каждый повёрнут относительно предыдущего.
    let parent: THREE.Object3D = this.trunk;
    let z = -0.45;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.z = z;
      const r = 0.14 * (1 - i * 0.17);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.2, 3, 8), skin);
      m.rotation.x = Math.PI / 2;
      m.position.z = -0.14;
      seg.add(m);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
      z = -0.26;
    }

    // Лапы, расставленные в стороны.
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.22, -0.05, sz * 0.28);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 3, 6), skin);
      upper.rotation.z = sx * 1.1;
      upper.position.set(sx * 0.1, -0.04, 0);
      leg.add(upper);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 3, 6), skin);
      lower.position.set(sx * 0.2, -0.18, 0);
      leg.add(lower);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), skin);
      foot.scale.set(1.2, 0.4, 1.5);
      foot.position.set(sx * 0.21, -0.28, 0.04);
      leg.add(foot);
      this.trunk.add(leg);
      this.legs.push(leg);
    }
    this.shadows();
  }

  protected pose() {
    const b = this.moveBlend;
    const s = Math.sin(this.phase);
    const atk = this.attackCurve();
    const hit = this.hitCurve();
    // Диагональные пары лап двигаются вместе.
    this.legs[0].rotation.y = s * 0.6 * b;
    this.legs[3].rotation.y = s * 0.6 * b;
    this.legs[1].rotation.y = -s * 0.6 * b;
    this.legs[2].rotation.y = -s * 0.6 * b;
    this.trunk.rotation.y = s * 0.15 * b;
    this.trunk.position.y = 0.36 + Math.sin(this.time * 2) * 0.01;
    this.tail.forEach((seg, i) => {
      seg.rotation.y = Math.sin(this.time * 2.2 - i * 0.7 + this.phase) * (0.12 + 0.15 * b);
      seg.rotation.x = 0.06;
    });
    this.headG.position.z = 0.52 + atk * 0.25;
    this.headG.rotation.x = -atk * 0.3 + hit * 0.4 + Math.sin(this.time * 0.7) * 0.05;
    this.jaw.rotation.x = atk * 0.5;
    this.trunk.rotation.x = -atk * 0.1 + hit * 0.15;
    if (this.deathT >= 0) {
      const e = easeInOut(this.deathT);
      this.body.rotation.z = Math.PI * e;
      this.body.position.y = 0.72 * e * this.body.scale.y;
    }
  }
}

// ─── Четвероногие: брамин (двухголовая корова) и собака ──────────────────────

export interface QuadLook {
  color: THREE.ColorRepresentation;
  secondary: THREE.ColorRepresentation;
  heads: 1 | 2;
  bodyLen: number;
  bodyR: number;
  legLen: number;
  horns?: boolean;
  ears?: boolean;
  tailLen: number;
}

export class QuadrupedRig extends Rig {
  readonly height: number;
  private trunk = new THREE.Group();
  private legs: THREE.Group[] = [];
  private heads: THREE.Group[] = [];
  private tailG = new THREE.Group();
  wag = 0;

  constructor(look: QuadLook) {
    super();
    const main = std(look.color, 0.85);
    const sec = std(look.secondary, 0.8);
    this.height = look.legLen + look.bodyR * 2;
    this.stride = look.legLen * 1.2;
    this.body.add(this.trunk);
    this.trunk.position.y = look.legLen + look.bodyR * 0.6;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(look.bodyR, look.bodyLen, 6, 14), main);
    torso.rotation.x = Math.PI / 2;
    this.trunk.add(torso);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(look.bodyR * 0.9, 12, 8), sec);
    belly.scale.set(0.9, 0.6, look.bodyLen / look.bodyR * 0.55);
    belly.position.y = -look.bodyR * 0.35;
    this.trunk.add(belly);

    const hz = look.bodyLen / 2 + look.bodyR * 0.6;
    for (let h = 0; h < look.heads; h++) {
      const neck = new THREE.Group();
      const hx = look.heads === 2 ? (h ? 1 : -1) * look.bodyR * 0.45 : 0;
      neck.position.set(hx, look.bodyR * 0.3, hz);
      neck.rotation.y = look.heads === 2 ? (h ? -0.25 : 0.25) : 0;
      const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(look.bodyR * 0.32, look.bodyR * 0.6, 4, 8), main);
      neckMesh.rotation.x = Math.PI / 2 - 0.6;
      neckMesh.position.set(0, look.bodyR * 0.2, look.bodyR * 0.3);
      neck.add(neckMesh);
      const head = new THREE.Mesh(new THREE.SphereGeometry(look.bodyR * 0.42, 12, 10), main);
      head.scale.set(0.85, 0.85, 1.4);
      head.position.set(0, look.bodyR * 0.5, look.bodyR * 0.75);
      neck.add(head);
      const snout = new THREE.Mesh(new THREE.SphereGeometry(look.bodyR * 0.26, 10, 8), sec);
      snout.scale.set(1, 0.8, 1);
      snout.position.set(0, look.bodyR * 0.4, look.bodyR * 1.25);
      neck.add(snout);
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(look.bodyR * 0.06, 6, 4), std('#0c0806', 0.3));
        eye.position.set(sx * look.bodyR * 0.24, look.bodyR * 0.66, look.bodyR * 0.98);
        neck.add(eye);
        if (look.horns) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(look.bodyR * 0.08, look.bodyR * 0.6, 6), std('#e0d6bc', 0.6));
          horn.position.set(sx * look.bodyR * 0.36, look.bodyR * 0.85, look.bodyR * 0.6);
          horn.rotation.z = -sx * 1.0;
          neck.add(horn);
        }
        if (look.ears) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(look.bodyR * 0.14, look.bodyR * 0.4, 4), main);
          ear.position.set(sx * look.bodyR * 0.25, look.bodyR * 0.95, look.bodyR * 0.6);
          ear.rotation.z = -sx * 0.3;
          neck.add(ear);
        }
      }
      this.trunk.add(neck);
      this.heads.push(neck);
    }

    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = new THREE.Group();
      leg.position.set(sx * look.bodyR * 0.55, -look.bodyR * 0.3, sz * look.bodyLen * 0.42);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(look.bodyR * 0.17, look.legLen * 0.8, 3, 8), main);
      m.position.y = -look.legLen * 0.5;
      leg.add(m);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(look.bodyR * 0.16, look.bodyR * 0.2, look.legLen * 0.12, 8), sec);
      hoof.position.y = -look.legLen + look.legLen * 0.05 - look.bodyR * 0.1;
      leg.add(hoof);
      this.trunk.add(leg);
      this.legs.push(leg);
    }

    this.tailG.position.set(0, look.bodyR * 0.4, -look.bodyLen / 2 - look.bodyR * 0.7);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(look.bodyR * 0.08, look.tailLen, 3, 6), main);
    tail.position.y = -look.tailLen * 0.4;
    tail.position.z = -look.tailLen * 0.15;
    this.tailG.rotation.x = 0.5;
    this.tailG.add(tail);
    this.trunk.add(this.tailG);
    this.shadows();
  }

  protected pose() {
    const b = this.moveBlend;
    const s = Math.sin(this.phase);
    const atk = this.attackCurve();
    this.legs[0].rotation.x = s * 0.5 * b;
    this.legs[3].rotation.x = s * 0.5 * b;
    this.legs[1].rotation.x = -s * 0.5 * b;
    this.legs[2].rotation.x = -s * 0.5 * b;
    this.heads.forEach((h, i) => {
      // Головы брамина живут своей жизнью.
      h.rotation.x = Math.sin(this.time * 0.6 + i * 2) * 0.15 + 0.1 - atk * 0.4;
      h.rotation.z = Math.sin(this.time * 0.4 + i * 3) * 0.1;
    });
    this.tailG.rotation.z = Math.sin(this.time * (4 + this.wag * 10)) * (0.25 + this.wag * 0.5);
    this.trunk.rotation.x = -Math.abs(s) * 0.03 * b;
    if (this.deathT >= 0) {
      const e = easeInOut(this.deathT);
      this.body.rotation.z = (Math.PI / 2) * e;
      this.body.position.y = this.trunk.position.y * 0.3 * e;
    }
  }
}
