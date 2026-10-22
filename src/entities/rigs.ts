import * as THREE from 'three';
import { clamp, lerp } from '../core/math';
import { SkinBuilder, blend, only, makeClip, sineKeys, type RotKey, type PosKey } from './skin';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function std(color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * Скелетная модель с AnimationMixer: циклы «покой» и «ходьба» смешиваются по скорости,
 * разовые действия (удар, попадание) временно перекрывают их, смерть фиксируется последним кадром.
 * Модель смотрит вдоль +Z.
 */
export abstract class Rig {
  readonly root = new THREE.Group();
  abstract readonly height: number;
  protected mixer!: THREE.AnimationMixer;
  private idle!: THREE.AnimationAction;
  private walk!: THREE.AnimationAction;
  private actions = new Map<string, THREE.AnimationAction>();
  private oneShot: { action: THREE.AnimationAction; t: number; dur: number } | null = null;
  private dead = false;
  protected moveBlend = 0;
  protected time = Math.random() * 10;
  /** Расстояние, проходимое за один цикл анимации ходьбы. */
  protected cycleDistance = 2;

  protected setupAnimations(target: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(target);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    this.idle = this.actions.get('idle')!;
    this.walk = this.actions.get('walk')!;
    this.idle.play();
    this.walk.play();
    this.walk.time = Math.random();
    this.walk.setEffectiveWeight(0);
  }

  protected attackClip(): string { return 'attack'; }

  private playOnce(name: string) {
    const a = this.actions.get(name);
    if (!a || this.dead) return;
    if (this.oneShot && this.oneShot.action !== a) this.oneShot.action.stop();
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    this.oneShot = { action: a, t: 0, dur: a.getClip().duration };
  }

  playAttack() { this.playOnce(this.attackClip()); }
  playHit() { this.playOnce('hit'); }
  playDeath() {
    if (this.dead) return;
    this.oneShot?.action.stop();
    this.oneShot = null;
    this.dead = true;
    const a = this.actions.get('death')!;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveWeight(1);
    a.play();
  }
  get isDead() { return this.dead; }

  update(dt: number, speed: number) {
    this.time += dt;
    this.moveBlend = lerp(this.moveBlend, speed > 0.05 ? 1 : 0, clamp(dt * 8, 0, 1));
    const dur = this.walk.getClip().duration;
    this.walk.timeScale = Math.max(0.35, (speed * dur) / this.cycleDistance);
    if (this.dead) {
      this.idle.setEffectiveWeight(0);
      this.walk.setEffectiveWeight(0);
    } else {
      let os = 0;
      if (this.oneShot) {
        const s = this.oneShot;
        s.t += dt;
        os = Math.min(1, s.t / 0.06) * Math.min(1, Math.max(0, (s.dur - s.t) / 0.15));
        s.action.setEffectiveWeight(os);
        if (s.t >= s.dur) {
          s.action.stop();
          this.oneShot = null;
          os = 0;
        }
      }
      this.idle.setEffectiveWeight((1 - this.moveBlend) * (1 - os));
      this.walk.setEffectiveWeight(this.moveBlend * (1 - os));
    }
    this.mixer.update(dt);
    this.post(dt);
  }

  /** Процедурные добавки поверх анимации. */
  protected post(_dt: number) {}
}

// ─── Человек ────────────────────────────────────────────────────────────────

export type WeaponVisual = 'none' | 'spear' | 'gun' | 'staff' | 'rifle' | 'sledge';

export interface HumanoidLook {
  skin: THREE.ColorRepresentation;
  cloth: THREE.ColorRepresentation;
  hair: THREE.ColorRepresentation;
  /** Жилет/накидка. */
  top?: THREE.ColorRepresentation;
  beard?: boolean;
  build?: number;
  scale?: number;
  armor?: 'jacket' | 'leather' | 'metal' | 'power';
  /** Особые существа на человеческом скелете. */
  monster?: 'deathclaw';
}

const ARMOR_COLORS = { jacket: '#3e2c20', leather: '#5e3c22', metal: '#6e6c66', power: '#2a2c2f' };

type HumanBone = 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'upperArmL' | 'upperArmR' | 'foreArmL' | 'foreArmR' | 'handL' | 'handR' | 'thighL' | 'thighR' | 'shinL' | 'shinR' | 'footL' | 'footR' | 'weaponHolder';

function humanClips(): THREE.AnimationClip[] {
  type R = Partial<Record<HumanBone, RotKey[]>>;
  const HIP_Y = 0.95;

  const idle: R = {
    chest: [[0, 0, 0, 0], [1.5, 0.035, 0, 0], [3, 0, 0, 0]],
    head: [[0, 0, 0, 0], [1, 0.02, 0.12, 0], [2, 0, -0.08, 0], [3, 0, 0, 0]],
    upperArmL: [[0, 0.05, 0, 0.1], [1.5, 0.08, 0, 0.13], [3, 0.05, 0, 0.1]],
    upperArmR: [[0, -0.15, 0, -0.1], [1.5, -0.13, 0, -0.13], [3, -0.15, 0, -0.1]],
    foreArmL: [[0, -0.15, 0, 0], [3, -0.15, 0, 0]],
    foreArmR: [[0, -0.65, 0, 0], [3, -0.65, 0, 0]],
    thighL: [[0, 0, 0, 0.02], [3, 0, 0, 0.02]],
    thighR: [[0, 0, 0, -0.02], [3, 0, 0, -0.02]],
    shinL: [[0, 0.03, 0, 0], [3, 0.03, 0, 0]],
    shinR: [[0, 0.03, 0, 0], [3, 0.03, 0, 0]],
  };
  const idlePos: Record<string, PosKey[]> = { hips: [[0, 0, HIP_Y, 0], [1.5, 0, HIP_Y - 0.008, 0], [3, 0, HIP_Y, 0]] };

  // Цикл ходьбы: левая нога впереди в t=0, правая — в t=0.5.
  const leg = (off: number): { thigh: RotKey[]; shin: RotKey[]; foot: RotKey[] } => {
    const sh = (t: number) => (t + off) % 1;
    const sortK = (k: RotKey[]) => {
      const out = k.map(([t, x, y, z]) => [sh(t), x, y, z] as RotKey).sort((a, b) => a[0] - b[0]);
      const first = out[0];
      if (first[0] > 0) out.unshift([0, ...out[out.length - 1].slice(1)] as unknown as RotKey);
      const last = out[out.length - 1];
      if (last[0] < 1) out.push([1, ...out[0].slice(1)] as unknown as RotKey);
      return out;
    };
    return {
      thigh: sortK([[0, -0.5, 0, 0], [0.25, 0, 0, 0], [0.5, 0.45, 0, 0], [0.75, 0, 0, 0]]),
      shin: sortK([[0, 0.1, 0, 0], [0.15, 0.25, 0, 0], [0.4, 0.12, 0, 0], [0.55, 0.35, 0, 0], [0.7, 1.15, 0, 0], [0.88, 0.35, 0, 0]]),
      foot: sortK([[0, 0.25, 0, 0], [0.25, 0, 0, 0], [0.5, -0.35, 0, 0], [0.7, -0.4, 0, 0], [0.88, 0.1, 0, 0]]),
    };
  };
  const L = leg(0);
  const Rl = leg(0.5);
  const walk: R = {
    thighL: L.thigh, shinL: L.shin, footL: L.foot,
    thighR: Rl.thigh, shinR: Rl.shin, footR: Rl.foot,
    upperArmL: [[0, 0.38, 0, 0.08], [0.5, -0.38, 0, 0.08], [1, 0.38, 0, 0.08]],
    upperArmR: [[0, -0.35, 0, -0.08], [0.5, 0.05, 0, -0.08], [1, -0.35, 0, -0.08]],
    foreArmL: [[0, -0.25, 0, 0], [0.5, -0.5, 0, 0], [1, -0.25, 0, 0]],
    foreArmR: [[0, -0.65, 0, 0], [1, -0.65, 0, 0]],
    spine: [[0, 0.06, 0, 0], [1, 0.06, 0, 0]],
    chest: [[0, 0, -0.1, 0], [0.5, 0, 0.1, 0], [1, 0, -0.1, 0]],
    head: [[0, -0.04, 0.06, 0], [0.5, -0.04, -0.06, 0], [1, -0.04, 0.06, 0]],
  };
  const walkHips: RotKey[] = [[0, 0, 0.09, 0], [0.5, 0, -0.09, 0], [1, 0, 0.09, 0]];
  const walkPos: Record<string, PosKey[]> = {
    hips: [[0, 0, HIP_Y - 0.03, 0], [0.25, 0, HIP_Y + 0.015, 0], [0.5, 0, HIP_Y - 0.03, 0], [0.75, 0, HIP_Y + 0.015, 0], [1, 0, HIP_Y - 0.03, 0]],
  };

  const lunge = (tStrike: number, end: number): R => ({
    thighL: [[0, 0, 0, 0], [tStrike, -0.45, 0, 0], [end, 0, 0, 0]],
    shinL: [[0, 0.03, 0, 0], [tStrike, 0.35, 0, 0], [end, 0.03, 0, 0]],
    thighR: [[0, 0, 0, 0], [tStrike, 0.3, 0, 0], [end, 0, 0, 0]],
    shinR: [[0, 0.03, 0, 0], [tStrike, 0.15, 0, 0], [end, 0.03, 0, 0]],
    upperArmL: [[0, 0.05, 0, 0.1], [tStrike, -0.5, 0, 0.25], [end, 0.05, 0, 0.1]],
    foreArmL: [[0, -0.15, 0, 0], [tStrike, -0.7, 0, 0], [end, -0.15, 0, 0]],
  });
  const lungePos = (tStrike: number, end: number): Record<string, PosKey[]> => ({
    hips: [[0, 0, HIP_Y, 0], [tStrike, 0, HIP_Y - 0.06, 0.08], [end, 0, HIP_Y, 0]],
  });

  const spear: R = {
    ...lunge(0.25, 0.6),
    upperArmR: [[0, -0.15, 0, -0.1], [0.12, 0.25, 0, -0.15], [0.25, -1.3, 0, 0], [0.45, -1.2, 0, 0], [0.6, -0.15, 0, -0.1]],
    foreArmR: [[0, -0.65, 0, 0], [0.12, -1.05, 0, 0], [0.25, -0.05, 0, 0], [0.45, -0.1, 0, 0], [0.6, -0.65, 0, 0]],
    weaponHolder: [[0, 0, 0, 0], [0.12, 1.9, 0, 0], [0.25, 2.12, 0, 0], [0.45, 2.0, 0, 0], [0.6, 0, 0, 0]],
    chest: [[0, 0, 0, 0], [0.12, 0, -0.3, 0], [0.25, 0.12, 0.35, 0], [0.6, 0, 0, 0]],
  };
  const punch: R = {
    ...lunge(0.22, 0.5),
    upperArmR: [[0, -0.15, 0, -0.1], [0.1, 0.3, 0, -0.2], [0.22, -1.5, 0, 0], [0.5, -0.15, 0, -0.1]],
    foreArmR: [[0, -0.65, 0, 0], [0.1, -1.6, 0, 0], [0.22, -0.05, 0, 0], [0.5, -0.65, 0, 0]],
    chest: [[0, 0, 0, 0], [0.1, 0, -0.25, 0], [0.22, 0.1, 0.35, 0], [0.5, 0, 0, 0]],
  };
  const gun: R = {
    upperArmR: [[0, -0.15, 0, -0.1], [0.12, -1.5, 0, 0], [0.18, -1.7, 0, 0], [0.4, -1.5, 0, 0], [0.55, -0.15, 0, -0.1]],
    foreArmR: [[0, -0.65, 0, 0], [0.12, -0.05, 0, 0], [0.4, -0.05, 0, 0], [0.55, -0.65, 0, 0]],
    chest: [[0, 0, 0, 0], [0.12, 0, 0.2, 0], [0.18, -0.05, 0.2, 0], [0.4, 0, 0.2, 0], [0.55, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.12, 0, 0.15, 0], [0.55, 0, 0, 0]],
  };
  // Удар кувалдой: замах над головой и удар сверху вниз.
  const swing: R = {
    ...lunge(0.32, 0.65),
    upperArmR: [[0, -0.15, 0, -0.1], [0.18, -2.8, 0, -0.1], [0.32, -0.9, 0, 0], [0.45, -0.8, 0, 0], [0.65, -0.15, 0, -0.1]],
    foreArmR: [[0, -0.65, 0, 0], [0.18, -0.6, 0, 0], [0.32, -0.1, 0, 0], [0.65, -0.65, 0, 0]],
    weaponHolder: [[0, 0, 0, 0], [0.18, 0, 0, 0], [0.32, 2.1, 0, 0], [0.45, 2.0, 0, 0], [0.65, 0, 0, 0]],
    upperArmL: [[0, 0.05, 0, 0.1], [0.18, -2.5, 0, 0.2], [0.32, -0.9, 0, 0.1], [0.65, 0.05, 0, 0.1]],
    spine: [[0, 0, 0, 0], [0.18, -0.2, 0, 0], [0.32, 0.3, 0, 0], [0.65, 0, 0, 0]],
  };
  const hit: R = {
    spine: [[0, 0, 0, 0], [0.1, -0.3, 0, 0], [0.35, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.1, 0.25, 0, 0], [0.35, 0, 0, 0]],
    upperArmL: [[0, 0.05, 0, 0.1], [0.1, -0.2, 0, 0.55], [0.35, 0.05, 0, 0.1]],
    upperArmR: [[0, -0.15, 0, -0.1], [0.1, -0.3, 0, -0.55], [0.35, -0.15, 0, -0.1]],
  };
  const hitPos: Record<string, PosKey[]> = { hips: [[0, 0, HIP_Y, 0], [0.1, 0, HIP_Y - 0.02, -0.06], [0.35, 0, HIP_Y, 0]] };
  const death: R = {
    hips: [[0, 0, 0, 0], [0.3, -0.25, 0, 0], [0.8, -1.5708, 0, 0.1], [1.1, -1.5708, 0, 0.1]],
    spine: [[0, 0, 0, 0], [0.3, 0.3, 0, 0], [0.8, 0.05, 0, 0], [1.1, 0.05, 0, 0]],
    head: [[0, 0, 0, 0], [0.8, -0.25, 0.4, 0], [1.1, -0.25, 0.4, 0]],
    thighL: [[0, 0, 0, 0], [0.3, -0.6, 0, 0], [0.8, -0.1, 0, 0.12], [1.1, -0.1, 0, 0.12]],
    thighR: [[0, 0, 0, 0], [0.3, -0.5, 0, 0], [0.8, -0.3, 0, -0.08], [1.1, -0.3, 0, -0.08]],
    shinL: [[0, 0, 0, 0], [0.3, 1.0, 0, 0], [0.8, 0.15, 0, 0], [1.1, 0.15, 0, 0]],
    shinR: [[0, 0, 0, 0], [0.3, 0.9, 0, 0], [0.8, 0.6, 0, 0], [1.1, 0.6, 0, 0]],
    upperArmL: [[0, 0, 0, 0.1], [0.8, -0.3, 0, 1.3], [1.1, -0.3, 0, 1.3]],
    upperArmR: [[0, 0, 0, -0.1], [0.8, -0.6, 0, -1.1], [1.1, -0.6, 0, -1.1]],
    foreArmL: [[0, 0, 0, 0], [0.8, -0.4, 0, 0], [1.1, -0.4, 0, 0]],
  };
  const deathPos: Record<string, PosKey[]> = {
    hips: [[0, 0, HIP_Y, 0], [0.3, 0, 0.75, -0.08], [0.8, 0, 0.14, -0.35], [1.1, 0, 0.14, -0.35]],
  };

  return [
    makeClip('idle', 3, idle as Record<string, RotKey[]>, idlePos),
    makeClip('walk', 1, { ...(walk as Record<string, RotKey[]>), hips: walkHips }, walkPos),
    makeClip('attack_spear', 0.6, spear as Record<string, RotKey[]>, lungePos(0.25, 0.6)),
    makeClip('attack_punch', 0.5, punch as Record<string, RotKey[]>, lungePos(0.22, 0.5)),
    makeClip('attack_gun', 0.55, gun as Record<string, RotKey[]>),
    makeClip('attack_swing', 0.65, swing as Record<string, RotKey[]>, lungePos(0.32, 0.65)),
    makeClip('hit', 0.35, hit as Record<string, RotKey[]>, hitPos),
    makeClip('death', 1.1, death as Record<string, RotKey[]>, deathPos),
  ];
}

let HUMAN_CLIPS: THREE.AnimationClip[] | null = null;

export class HumanoidRig extends Rig {
  readonly height: number;
  private weapons: Record<WeaponVisual, THREE.Object3D | null>;
  private weapon: WeaponVisual = 'none';
  private inner = new THREE.Group();
  readonly armorLook: HumanoidLook['armor'];

  constructor(look: HumanoidLook) {
    super();
    this.armorLook = look.armor;
    const scale = look.scale ?? 1;
    const b = look.build ?? 1;
    this.height = 1.8 * scale;
    this.cycleDistance = 1.9;

    // Силовая броня закрывает всё тело: «кожа» становится металлом.
    const power = look.armor === 'power';
    const skin = new THREE.Color(power ? '#33363a' : look.skin);
    const cloth = new THREE.Color(power ? '#26282b' : look.cloth);
    const hair = new THREE.Color(power ? '#33363a' : look.hair);
    const topColor = look.armor ? ARMOR_COLORS[look.armor] : look.top;
    const top = topColor ? new THREE.Color(topColor) : null;
    const leather = new THREE.Color('#4e3626');
    const dark = new THREE.Color('#140d08');
    const lips = skin.clone().multiplyScalar(0.8);

    const sb = new SkinBuilder();
    sb.bone('hips', null, V(0, 0.95, 0))
      .bone('spine', 'hips', V(0, 1.1, 0))
      .bone('chest', 'spine', V(0, 1.3, 0))
      .bone('neck', 'chest', V(0, 1.5, 0))
      .bone('head', 'neck', V(0, 1.6, 0.01));
    for (const [s, x] of [['L', 1], ['R', -1]] as const) {
      sb.bone(`upperArm${s}`, 'chest', V(0.19 * x * b, 1.45, 0))
        .bone(`foreArm${s}`, `upperArm${s}`, V(0.22 * x * b, 1.17, 0))
        .bone(`hand${s}`, `foreArm${s}`, V(0.24 * x * b, 0.94, 0.01))
        .bone(`thigh${s}`, 'hips', V(0.1 * x * b, 0.93, 0))
        .bone(`shin${s}`, `thigh${s}`, V(0.1 * x * b, 0.51, 0.01))
        .bone(`foot${s}`, `shin${s}`, V(0.1 * x * b, 0.09, 0));
    }

    // Торс из трёх сегментов с плавными переходами весов.
    sb.tube({
      from: V(0, 0.83, 0), to: V(0, 1.1, 0), r0: 0.145 * b, r1: 0.135 * b, squash: [1.18, 0.82],
      weights: (t) => (t < 0.6 ? [['hips', 1]] : blend('hips', 'spine', 0.6, 1.4)(t)),
      color: (t) => (t < 0.62 ? cloth : skin),
    });
    sb.tube({
      from: V(0, 1.08, 0), to: V(0, 1.32, 0), r0: 0.133 * b, r1: 0.15 * b, squash: [1.15, 0.8],
      weights: (t) => (t < 0.3 ? blend('hips', 'spine', -0.3, 0.3)(t) : t > 0.75 ? blend('spine', 'chest', 0.75, 1.25)(t) : [['spine', 1]]),
      color: () => skin,
    });
    sb.tube({
      from: V(0, 1.3, 0), to: V(0, 1.53, 0), r0: 0.15 * b, r1: 0.09,
      radius: (t) => (t < 0.55 ? lerp(0.15, 0.165, t / 0.55) * b : lerp(0.165 * b, 0.07, (t - 0.55) / 0.45)),
      squash: [1.3, 0.78],
      weights: (t) => (t < 0.25 ? blend('spine', 'chest', -0.25, 0.25)(t) : [['chest', 1]]),
      color: () => skin,
    });
    if (top) {
      sb.tube({
        from: V(0, 1.12, 0), to: V(0, 1.47, 0), r0: 0.148 * b, r1: 0.17 * b, squash: [1.33, 0.82], caps: false, radial: 18,
        weights: (t) => (t < 0.35 ? blend('spine', 'chest', 0, 0.35)(t) : [['chest', 1]]),
        color: (_t, d) => (Math.abs(d.z) > 0.92 && d.z > 0 ? top.clone().multiplyScalar(0.7) : top),
      });
    }
    // Набедренная повязка.
    sb.tube({
      from: V(0, 0.99, 0), to: V(0, 0.72, 0.015), r0: 0.165 * b, r1: 0.19 * b, squash: [1.12, 0.92], caps: false, radial: 18,
      weights: only('hips'), color: (t) => (t < 0.15 ? leather : cloth),
    });
    sb.tube({
      from: V(0, 1.47, 0), to: V(0, 1.63, 0.01), r0: 0.052, r1: 0.048, caps: false,
      weights: (t) => blend('chest', 'neck', -0.2, 0.5)(t).concat(t > 0.8 ? [['head', (t - 0.8) * 2]] : []),
      color: () => skin,
    });
    // Голова: волосы сверху и сзади, лицо спереди.
    sb.ellipsoid(V(0, 1.71, 0.01), V(0.1, 0.122, 0.112), [['head', 1]], (n) => (n.y > 0.25 || (n.z < -0.25 && n.y > -0.55) ? hair : skin), [20, 16]);
    sb.ellipsoid(V(0, 1.68, 0.108), V(0.018, 0.03, 0.026), [['head', 1]], () => skin, [8, 6]);
    sb.ellipsoid(V(0, 1.645, 0.095), V(0.03, 0.008, 0.012), [['head', 1]], () => lips, [8, 4]);
    for (const x of [-1, 1]) {
      sb.ellipsoid(V(0.036 * x, 1.715, 0.094), V(0.016, 0.011, 0.01), [['head', 1]], () => dark, [8, 6]);
      sb.ellipsoid(V(0.036 * x, 1.735, 0.1), V(0.022, 0.006, 0.01), [['head', 1]], () => hair, [8, 4]);
      sb.ellipsoid(V(0.098 * x, 1.7, 0), V(0.018, 0.032, 0.024), [['head', 1]], () => skin, [8, 6]);
    }
    if (look.beard) sb.ellipsoid(V(0, 1.61, 0.06), V(0.072, 0.085, 0.055), [['head', 1]], () => hair, [12, 10]);

    for (const [s, x] of [['L', 1], ['R', -1]] as const) {
      const ua = `upperArm${s}`;
      const fa = `foreArm${s}`;
      const th = `thigh${s}`;
      const sh = `shin${s}`;
      sb.ellipsoid(V(0.185 * x * b, 1.45, 0), V(0.065 * b, 0.06, 0.06), [['chest', 0.5], [ua, 0.5]], () => (top ? top : skin), [10, 8]);
      sb.tube({
        from: V(0.19 * x * b, 1.45, 0), to: V(0.22 * x * b, 1.17, 0), r0: 0.054 * b, r1: 0.042 * b, rings: 5,
        weights: (t) => (t < 0.2 ? blend('chest', ua, -0.2, 0.2)(t) : [[ua, 1]]),
        color: () => skin,
      });
      sb.tube({
        from: V(0.22 * x * b, 1.17, 0), to: V(0.24 * x * b, 0.96, 0.01), r0: 0.042 * b, r1: 0.032 * b, rings: 5,
        weights: (t) => (t < 0.25 ? blend(ua, fa, -0.25, 0.25)(t) : [[fa, 1]]),
        color: (t) => (t > 0.72 && t < 0.92 ? leather : skin),
      });
      sb.ellipsoid(V(0.245 * x * b, 0.9, 0.012), V(0.03, 0.055, 0.042), [[`hand${s}`, 1]], () => skin, [10, 8]);
      sb.tube({
        from: V(0.1 * x * b, 0.95, 0), to: V(0.1 * x * b, 0.51, 0.01), r0: 0.082 * b, r1: 0.056 * b,
        weights: (t) => (t < 0.18 ? blend('hips', th, -0.18, 0.18)(t) : [[th, 1]]),
        color: () => skin,
      });
      sb.tube({
        from: V(0.1 * x * b, 0.51, 0.01), to: V(0.1 * x * b, 0.1, 0), r0: 0.054 * b, r1: 0.036 * b,
        weights: (t) => (t < 0.22 ? blend(th, sh, -0.22, 0.22)(t) : [[sh, 1]]),
        color: (t) => (t > 0.72 ? leather : skin),
      });
      sb.ellipsoid(V(0.1 * x * b, 0.05, 0.045), V(0.048, 0.042, 0.115), [[`foot${s}`, 1]], () => leather, [10, 8]);
    }

    // Держатель оружия: анимируется клипами атаки, вложенная группа задаёт хват конкретного оружия.
    const holder = new THREE.Group();
    holder.name = 'weaponHolder';
    holder.add(this.inner);
    sb.attach('handR', holder, V(-0.245 * b, 0.9, 0.01));

    if (power) {
      const shell = std('#2e3134', 0.35, 0.85);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), shell);
      helmet.scale.set(1, 1.05, 1.08);
      sb.attach('head', helmet, V(0, 1.71, 0.01));
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: '#ff5030', emissive: '#ff3010', emissiveIntensity: 2.5 }));
      sb.attach('head', visor, V(0, 1.72, 0.165));
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.34 * b, 0.36, 0.18), shell);
      sb.attach('chest', tank, V(0, 1.36, -0.2 * b));
      for (const [s2, x] of [['L', 1], ['R', -1]] as const) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.13 * b, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), shell);
        pad.scale.set(1.15, 0.8, 1.1);
        pad.rotation.z = -x * 0.35;
        sb.attach(`upperArm${s2}`, pad, V(0.21 * x * b, 1.48, 0));
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.075 * b, 10, 8), shell);
        sb.attach(`shin${s2}`, knee, V(0.1 * x * b, 0.5, 0.06));
      }
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4 * b, 0.34, 0.08), shell);
      sb.attach('chest', plate, V(0, 1.36, 0.15 * b));
    } else if (look.armor) {
      const padMat = look.armor === 'metal' ? std('#8a8a86', 0.35, 0.8) : std(look.armor === 'leather' ? '#4a2e1a' : '#33241a', 0.75);
      for (const [s2, x] of [['L', 1], ['R', -1]] as const) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.085 * b, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), padMat);
        pad.scale.set(1.1, 0.7, 1);
        pad.rotation.z = -x * 0.35;
        sb.attach(`upperArm${s2}`, pad, V(0.2 * x * b, 1.47, 0));
      }
      if (look.armor !== 'jacket') {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3 * b, 0.26, 0.05), padMat);
        sb.attach('chest', plate, V(0, 1.38, 0.14 * b));
        const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17 * b, 0.025, 6, 20), std('#2a1c12', 0.8));
        belt.rotation.x = Math.PI / 2;
        belt.scale.set(1.15, 0.82, 1);
        sb.attach('hips', belt, V(0, 0.98, 0));
      }
    }

    if (look.monster === 'deathclaw') {
      // Коготь смерти: рога и длинные когти на руках.
      const bone = std('#d8ccb0', 0.5);
      for (const [s2, x] of [['L', 1], ['R', -1]] as const) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 8), bone);
        horn.rotation.set(-0.5, 0, -x * 0.5);
        sb.attach('head', horn, V(0.07 * x, 1.83, -0.02));
        for (let k = -1; k <= 1; k++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.26, 6), bone);
          claw.rotation.x = Math.PI + 0.3;
          sb.attach(`hand${s2}`, claw, V(0.245 * x * b + k * 0.025, 0.78, 0.04));
        }
      }
      const eyeMat = new THREE.MeshStandardMaterial({ color: '#ffd040', emissive: '#a06000', emissiveIntensity: 1.2 });
      for (const x of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), eyeMat);
        sb.attach('head', eye, V(0.04 * x, 1.725, 0.1));
      }
    }

    const wood = std('#6a4a30', 0.85);
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 2.1, 8), wood);
    shaft.position.y = 0.45;
    spear.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 4), std('#3a3634', 0.35, 0.3));
    tip.position.y = 1.62;
    spear.add(tip);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 8), std('#4e3626', 0.9));
    wrap.position.y = 1.45;
    spear.add(wrap);
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), std('#3c3c3e', 0.4, 0.8));
    barrel.position.y = -0.17;
    gun.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.09), std('#4a3424', 0.7));
    grip.position.set(0, -0.02, -0.05);
    gun.add(grip);
    const staff = new THREE.Group();
    const staffShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.8, 8), wood);
    staffShaft.position.y = 0.35;
    staff.add(staffShaft);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), std('#e6dcc4', 0.6));
    orb.position.y = 1.28;
    staff.add(orb);
    const steel = std('#3c3c3e', 0.4, 0.8);
    const rifle = new THREE.Group();
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.75, 8), steel);
    rBarrel.position.y = -0.42;
    rifle.add(rBarrel);
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.08), std('#5a3a22', 0.7));
    rBody.position.set(0, -0.02, -0.02);
    rifle.add(rBody);
    const rStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.28, 0.1), std('#5a3a22', 0.7));
    rStock.position.set(0, 0.24, -0.05);
    rifle.add(rStock);
    const sledge = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 1.0, 8), wood);
    handle.position.y = 0.25;
    sledge.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.3), steel);
    head.position.y = 0.75;
    sledge.add(head);
    this.weapons = { none: null, spear, gun, staff, rifle, sledge };
    for (const w of [spear, gun, staff, rifle, sledge]) {
      w.visible = false;
      w.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
      this.inner.add(w);
    }

    const { mesh } = sb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }));
    mesh.scale.setScalar(scale);
    this.root.add(mesh);
    HUMAN_CLIPS ??= humanClips();
    this.setupAnimations(mesh, HUMAN_CLIPS);
  }

  setWeapon(w: WeaponVisual) {
    this.weapon = w;
    for (const [k, obj] of Object.entries(this.weapons)) if (obj) obj.visible = k === w;
    // Копьё и посох держим вертикально при согнутом локте.
    this.inner.rotation.x = w === 'spear' || w === 'staff' || w === 'sledge' ? 0.8 : 0;
  }

  protected attackClip() {
    switch (this.weapon) {
      case 'gun':
      case 'rifle':
        return 'attack_gun';
      case 'spear':
      case 'staff':
        return 'attack_spear';
      case 'sledge':
        return 'attack_swing';
      default:
        return 'attack_punch';
    }
  }
}

// ─── Ящер (геккон) ──────────────────────────────────────────────────────────

let LIZARD_CLIPS: THREE.AnimationClip[] | null = null;

function lizardClips(): THREE.AnimationClip[] {
  const Y = 0.36;
  const tail = (dur: number, amp: number, n = 8): Record<string, RotKey[]> => {
    const r: Record<string, RotKey[]> = {};
    for (let i = 1; i <= 4; i++) r[`tail${i}`] = sineKeys(dur, 1, amp, -i * 0.7, 0, n, [0.04, 0, 0]);
    return r;
  };
  const walkDur = 0.6;
  const s = (phase: number) => sineKeys(walkDur, 1, 0.55, phase);
  const lift = (phase: number) => sineKeys(walkDur, 0, 0.25, phase);
  const walk = makeClip('walk', walkDur, {
    ...tail(walkDur, 0.28),
    // Диагональные пары лап движутся вместе.
    flU: s(Math.PI), frU: s(Math.PI), hlU: s(0), hrU: s(0),
    flL: lift(0), frL: lift(Math.PI), hlL: lift(Math.PI), hrL: lift(0),
    body: sineKeys(walkDur, 1, 0.16, 0),
    neck: sineKeys(walkDur, 1, -0.12, 0),
  }, { body: sineKeys(walkDur, 1, 0, 0).map(([t]) => [t, 0, Y + 0.015 * Math.abs(Math.sin((t / walkDur) * Math.PI * 2)), 0]) as PosKey[] });
  const idle = makeClip('idle', 2.4, {
    ...tail(2.4, 0.12),
    neck: [[0, 0, 0, 0], [0.8, -0.08, 0.15, 0], [1.6, 0.04, -0.1, 0], [2.4, 0, 0, 0]],
    jaw: [[0, 0, 0, 0], [1.1, 0, 0, 0], [1.2, 0.12, 0, 0], [1.4, 0, 0, 0], [2.4, 0, 0, 0]],
  }, { body: [[0, 0, Y, 0], [1.2, 0, Y + 0.012, 0], [2.4, 0, Y, 0]] });
  const attack = makeClip('attack', 0.55, {
    neck: [[0, 0, 0, 0], [0.15, -0.35, 0, 0], [0.28, 0.25, 0, 0], [0.55, 0, 0, 0]],
    jaw: [[0, 0, 0, 0], [0.15, 0.7, 0, 0], [0.3, 0, 0, 0], [0.55, 0, 0, 0]],
    body: [[0, 0, 0, 0], [0.15, -0.12, 0, 0], [0.28, 0.08, 0, 0], [0.55, 0, 0, 0]],
  }, { body: [[0, 0, Y, 0], [0.15, 0, Y + 0.04, -0.06], [0.28, 0, Y, 0.2], [0.55, 0, Y, 0]] });
  const hit = makeClip('hit', 0.35, {
    body: [[0, 0, 0, 0], [0.1, 0.18, 0.2, 0], [0.35, 0, 0, 0]],
    neck: [[0, 0, 0, 0], [0.1, -0.35, 0, 0], [0.35, 0, 0, 0]],
  });
  const death = makeClip('death', 0.9, {
    body: [[0, 0, 0, 0], [0.4, 0, 0, 1.6], [0.9, 0, 0, Math.PI]],
    neck: [[0, 0, 0, 0], [0.9, 0.4, 0.3, 0]],
    jaw: [[0, 0, 0, 0], [0.9, 0.5, 0, 0]],
    flU: [[0, 0, 0, 0], [0.9, 0, 0.3, 0.4]], frU: [[0, 0, 0, 0], [0.9, 0, -0.3, -0.4]],
    ...tail(0.9, 0.05, 2),
  }, { body: [[0, 0, Y, 0], [0.4, 0, Y + 0.2, 0], [0.9, 0, 0.2, 0]] });
  return [idle, walk, attack, hit, death];
}

export class LizardRig extends Rig {
  readonly height: number;

  constructor(color: THREE.ColorRepresentation, belly: THREE.ColorRepresentation, scale = 1) {
    super();
    this.height = 0.7 * scale;
    this.cycleDistance = 0.9;
    const top = new THREE.Color(color);
    const bel = new THREE.Color(belly);
    const stripe = top.clone().multiplyScalar(0.6);
    // Спина в тёмных поперечных полосах, брюхо светлое.
    const scaleCol = (z: number) => (d: THREE.Vector3) => (d.y < -0.35 ? bel : Math.sin(z * 22) > 0.6 && d.y > 0.2 ? stripe : top);

    const sb = new SkinBuilder();
    const Y = 0.36;
    sb.bone('body', null, V(0, Y, 0))
      .bone('chest', 'body', V(0, Y, 0.22))
      .bone('neck', 'chest', V(0, Y + 0.04, 0.42))
      .bone('head', 'neck', V(0, Y + 0.06, 0.56))
      .bone('jaw', 'head', V(0, Y + 0.02, 0.58))
      .bone('pelvis', 'body', V(0, Y, -0.22))
      .bone('tail1', 'pelvis', V(0, Y - 0.01, -0.4))
      .bone('tail2', 'tail1', V(0, Y - 0.04, -0.62))
      .bone('tail3', 'tail2', V(0, Y - 0.08, -0.84))
      .bone('tail4', 'tail3', V(0, Y - 0.12, -1.04));
    const legs: [string, string, number, number][] = [['fl', 'chest', 1, 0.24], ['fr', 'chest', -1, 0.24], ['hl', 'pelvis', 1, -0.24], ['hr', 'pelvis', -1, -0.24]];
    for (const [n, parent, x, z] of legs) {
      sb.bone(`${n}U`, parent, V(0.15 * x, Y - 0.02, z)).bone(`${n}L`, `${n}U`, V(0.34 * x, Y - 0.1, z + 0.02));
    }

    // Туловище — одна трубка с весами pelvis → body → chest → neck.
    const bodyW = (t: number): [string, number][] => {
      const z = lerp(-0.42, 0.5, t);
      if (z < -0.2) return [['pelvis', 1]];
      if (z < 0) return blend('pelvis', 'body', -0.2, 0)(z);
      if (z < 0.22) return blend('body', 'chest', 0, 0.22)(z);
      if (z < 0.4) return [['chest', 1]];
      return blend('chest', 'neck', 0.4, 0.5)(z);
    };
    sb.tube({
      from: V(0, Y, -0.42), to: V(0, Y + 0.03, 0.5), r0: 0.16, r1: 0.12, rings: 12, radial: 16, squash: [1.15, 0.78],
      radius: (t) => 0.16 + Math.sin(t * Math.PI) * 0.11 - t * 0.05,
      weights: bodyW,
      color: (t, d) => scaleCol(lerp(-0.42, 0.5, t))(d),
    });
    sb.tube({
      from: V(0, Y + 0.04, 0.42), to: V(0, Y + 0.06, 0.58), r0: 0.12, r1: 0.11, caps: false,
      weights: blend('neck', 'head', 0.2, 1), color: (_t, d) => (d.y < -0.35 ? bel : top),
    });
    sb.ellipsoid(V(0, Y + 0.08, 0.68), V(0.13, 0.095, 0.18), [['head', 1]], (n) => (n.y < -0.4 ? bel : top), [16, 12]);
    sb.ellipsoid(V(0, Y + 0.0, 0.68), V(0.1, 0.045, 0.15), [['jaw', 1]], () => bel, [12, 8]);
    // Хвост по цепочке костей.
    const tailPts = [V(0, Y, -0.38), V(0, Y - 0.01, -0.4), V(0, Y - 0.04, -0.62), V(0, Y - 0.08, -0.84), V(0, Y - 0.12, -1.04), V(0, Y - 0.15, -1.22)];
    const tailBones = ['pelvis', 'tail1', 'tail2', 'tail3', 'tail4'];
    for (let i = 1; i < 5; i++) {
      const r0 = 0.14 * (1 - (i - 1) * 0.22);
      const r1 = 0.14 * (1 - i * 0.22) + 0.012;
      sb.tube({
        from: tailPts[i], to: tailPts[i + 1], r0, r1, rings: 4, squash: [1.05, 0.85], caps: i === 4,
        weights: (t) => (t < 0.3 ? blend(tailBones[i - 1], tailBones[i], -0.3, 0.3)(t) : [[tailBones[i], 1]]),
        color: (_t, d) => scaleCol(tailPts[i].z)(d),
      });
    }
    for (const [n, parent, x, z] of legs) {
      sb.tube({
        from: V(0.13 * x, Y - 0.02, z), to: V(0.34 * x, Y - 0.1, z + 0.02), r0: 0.065, r1: 0.05, rings: 4,
        weights: (t) => (t < 0.25 ? blend(parent, `${n}U`, -0.25, 0.25)(t) : [[`${n}U`, 1]]),
        color: (_t, d) => (d.y < -0.3 ? bel : top),
      });
      sb.tube({
        from: V(0.34 * x, Y - 0.1, z + 0.02), to: V(0.37 * x, Y - 0.33, z + 0.04), r0: 0.048, r1: 0.04, rings: 4,
        weights: (t) => (t < 0.25 ? blend(`${n}U`, `${n}L`, -0.25, 0.25)(t) : [[`${n}L`, 1]]),
        color: () => top,
      });
      sb.ellipsoid(V(0.38 * x, Y - 0.345, z + 0.08), V(0.07, 0.025, 0.08), [[`${n}L`, 1]], () => bel, [8, 6]);
    }
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#f2c230', emissive: '#7a5200', emissiveIntensity: 0.7, roughness: 0.15 });
    for (const x of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), eyeMat);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.019, 6, 6), std('#000', 0.2));
      pupil.scale.set(0.5, 1.2, 1);
      pupil.position.set(x * 0.02, 0, 0.03);
      eye.add(pupil);
      sb.attach('head', eye, V(x * 0.1, Y + 0.13, 0.72));
    }
    // Гребень вдоль спины.
    for (let i = 0; i < 7; i++) {
      const z = -0.3 + i * 0.12;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), std(belly, 0.7));
      spike.rotation.x = -0.4;
      sb.attach(z < -0.1 ? 'pelvis' : z < 0.15 ? 'body' : 'chest', spike, V(0, Y + 0.22 - Math.abs(z) * 0.08, z));
    }

    const { mesh } = sb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 }));
    mesh.scale.setScalar(scale);
    this.root.add(mesh);
    LIZARD_CLIPS ??= lizardClips();
    this.setupAnimations(mesh, LIZARD_CLIPS);
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

function quadClips(look: QuadLook): THREE.AnimationClip[] {
  const by = look.legLen + look.bodyR * 0.6;
  const walkDur = 0.9;
  const swing = (phase: number) => sineKeys(walkDur, 0, 0.45, phase);
  const knee = (phase: number) => sineKeys(walkDur, 0, 0.3, phase, 0.3);
  const necks = (dur: number, amp: number, base = 0.1): Record<string, RotKey[]> => {
    const r: Record<string, RotKey[]> = {};
    for (let h = 0; h < look.heads; h++) {
      r[`neck${h}`] = [[0, base, 0, 0], [dur * 0.3, base + amp, (h ? -1 : 1) * 0.15, 0], [dur * 0.7, base - amp * 0.5, (h ? 1 : -1) * 0.1, 0], [dur, base, 0, 0]];
    }
    return r;
  };
  const tail = (dur: number, amp: number) => sineKeys(dur, 2, amp, 0, 0, 8, [0.5, 0, 0]);
  return [
    makeClip('idle', 4, { ...necks(4, 0.2), tail: tail(4, 0.25) }, { body: [[0, 0, by, 0], [2, 0, by - 0.01, 0], [4, 0, by, 0]] }),
    makeClip('walk', walkDur, {
      legFL: swing(0), legHR: swing(0), legFR: swing(Math.PI), legHL: swing(Math.PI),
      shinFL: knee(-1.2), shinHR: knee(-1.2), shinFR: knee(Math.PI - 1.2), shinHL: knee(Math.PI - 1.2),
      ...necks(walkDur, 0.06, 0.05), tail: tail(walkDur, 0.2),
    }, { body: sineKeys(walkDur, 1, 0, 0).map(([t]) => [t, 0, by + 0.025 * Math.abs(Math.sin((t / walkDur) * Math.PI * 2)), 0]) as PosKey[] }),
    makeClip('attack', 0.6, necks(0.6, 0.5, 0.1)),
    makeClip('hit', 0.35, { body: [[0, 0, 0, 0], [0.1, -0.1, 0, 0.1], [0.35, 0, 0, 0]] }),
    makeClip('death', 1, {
      body: [[0, 0, 0, 0], [0.5, 0, 0, 0.6], [1, 0, 0, Math.PI / 2]],
      legFL: [[0, 0, 0, 0], [1, -0.3, 0, 0]], legHL: [[0, 0, 0, 0], [1, 0.3, 0, 0]],
      ...necks(1, 0.3, 0.3),
    }, { body: [[0, 0, by, 0], [0.5, 0, by * 0.85, 0], [1, 0, look.bodyR * 1.05, 0]] }),
  ];
}

export class QuadrupedRig extends Rig {
  readonly height: number;
  private tailBone: THREE.Bone;
  wag = 0;

  constructor(look: QuadLook) {
    super();
    const main = new THREE.Color(look.color);
    const sec = new THREE.Color(look.secondary);
    const R = look.bodyR;
    const BL = look.bodyLen;
    const LL = look.legLen;
    this.height = LL + R * 2;
    this.cycleDistance = LL * 3.2;
    const by = LL + R * 0.6;
    // Пятнистая шкура.
    const hide = (p: number, d: THREE.Vector3) => (d.y < -0.5 ? sec : Math.sin(p * 9 + d.x * 4) > 0.75 ? sec.clone().lerp(main, 0.5) : main);

    const sb = new SkinBuilder();
    sb.bone('body', null, V(0, by, 0))
      .bone('front', 'body', V(0, by, BL * 0.35))
      .bone('rear', 'body', V(0, by, -BL * 0.35))
      .bone('tail', 'rear', V(0, by + R * 0.35, -BL / 2 - R * 0.75));
    const neckBase = (h: number) => V(look.heads === 2 ? (h ? -1 : 1) * R * 0.42 : 0, by + R * 0.3, BL / 2 + R * 0.45);
    for (let h = 0; h < look.heads; h++) {
      const nb = neckBase(h);
      sb.bone(`neck${h}`, 'front', nb).bone(`head${h}`, `neck${h}`, nb.clone().add(V(0, R * 0.45, R * 0.55)));
    }
    const legSpots: [string, string, number, number][] = [['FL', 'front', 1, BL * 0.42], ['FR', 'front', -1, BL * 0.42], ['HL', 'rear', 1, -BL * 0.42], ['HR', 'rear', -1, -BL * 0.42]];
    for (const [n, parent, x, z] of legSpots) {
      sb.bone(`leg${n}`, parent, V(x * R * 0.55, by - R * 0.3, z)).bone(`shin${n}`, `leg${n}`, V(x * R * 0.55, by - R * 0.3 - LL * 0.5, z));
    }

    sb.tube({
      from: V(0, by, -BL / 2 - R * 0.2), to: V(0, by + R * 0.08, BL / 2 + R * 0.2), r0: R * 0.85, r1: R * 0.9, rings: 10, radial: 18,
      radius: (t) => R * (0.82 + 0.18 * Math.sin(t * Math.PI)),
      squash: [0.92, 1],
      weights: (t) => (t < 0.35 ? [['rear', 1]] : t < 0.65 ? blend('rear', 'front', 0.35, 0.65)(t) : [['front', 1]]),
      color: (t, d) => hide(t, d),
    });
    for (let h = 0; h < look.heads; h++) {
      const nb = neckBase(h);
      const hp = nb.clone().add(V(0, R * 0.45, R * 0.55));
      sb.tube({
        from: nb.clone().add(V(0, -R * 0.15, -R * 0.3)), to: hp, r0: R * 0.38, r1: R * 0.3, rings: 5,
        weights: (t) => (t < 0.3 ? blend('front', `neck${h}`, 0, 0.3)(t) : t > 0.8 ? blend(`neck${h}`, `head${h}`, 0.8, 1.1)(t) : [[`neck${h}`, 1]]),
        color: (_t, d) => (d.y < -0.4 ? sec : main),
      });
      sb.ellipsoid(hp.clone().add(V(0, R * 0.05, R * 0.18)), V(R * 0.36, R * 0.36, R * 0.5), [[`head${h}`, 1]], (n) => (n.y < -0.6 ? sec : main), [14, 10]);
      sb.ellipsoid(hp.clone().add(V(0, -R * 0.05, R * 0.62)), V(R * 0.26, R * 0.22, R * 0.22), [[`head${h}`, 1]], () => sec, [12, 8]);
      for (const x of [-1, 1]) {
        sb.ellipsoid(hp.clone().add(V(x * R * 0.22, R * 0.17, R * 0.42)), V(R * 0.05, R * 0.05, R * 0.04), [[`head${h}`, 1]], () => new THREE.Color('#0c0806'), [6, 5]);
        if (look.horns) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(R * 0.08, R * 0.65, 8), std('#e0d6bc', 0.55));
          horn.rotation.z = -x * 1.1;
          sb.attach(`head${h}`, horn, hp.clone().add(V(x * R * 0.38, R * 0.35, R * 0.05)));
        }
        if (look.ears) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(R * 0.14, R * 0.42, 4), std(look.color, 0.9));
          ear.rotation.z = -x * 0.3;
          sb.attach(`head${h}`, ear, hp.clone().add(V(x * R * 0.24, R * 0.42, R * 0.02)));
        }
      }
    }
    for (const [n, parent, x, z] of legSpots) {
      const top = V(x * R * 0.55, by - R * 0.1, z);
      const knee = V(x * R * 0.55, by - R * 0.3 - LL * 0.5, z);
      const foot = V(x * R * 0.55, R * 0.05, z);
      sb.tube({
        from: top, to: knee, r0: R * 0.24, r1: R * 0.16, rings: 4,
        weights: (t) => (t < 0.25 ? blend(parent, `leg${n}`, 0, 0.25)(t) : [[`leg${n}`, 1]]),
        color: () => main,
      });
      sb.tube({
        from: knee, to: foot, r0: R * 0.15, r1: R * 0.14, rings: 4,
        weights: (t) => (t < 0.2 ? blend(`leg${n}`, `shin${n}`, -0.2, 0.2)(t) : [[`shin${n}`, 1]]),
        color: (t) => (t > 0.82 ? sec.clone().multiplyScalar(0.6) : main),
      });
    }
    const tailTop = V(0, by + R * 0.35, -BL / 2 - R * 0.75);
    sb.tube({
      from: tailTop, to: tailTop.clone().add(V(0, -look.tailLen * 0.8, -look.tailLen * 0.4)), r0: R * 0.09, r1: R * 0.05, rings: 4,
      weights: (t) => (t < 0.15 ? blend('rear', 'tail', -0.15, 0.15)(t) : [['tail', 1]]),
      color: (t) => (t > 0.75 ? sec : main),
    });

    const { mesh, bone } = sb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    this.tailBone = bone('tail');
    this.root.add(mesh);
    this.setupAnimations(mesh, quadClips(look));
  }

  protected post() {
    if (this.wag > 0 && !this.isDead) this.tailBone.rotateY(Math.sin(this.time * (6 + this.wag * 10)) * this.wag * 0.6);
  }
}

// ─── Турель ─────────────────────────────────────────────────────────────────

let TURRET_CLIPS: THREE.AnimationClip[] | null = null;

/** Автоматическая турель: неподвижное основание и поворотная голова со стволами. */
export class TurretRig extends Rig {
  readonly height = 1.6;

  constructor() {
    super();
    const steel = std('#3a3e42', 0.4, 0.8);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1, 16), steel);
    base.position.y = 0.5;
    this.root.add(base);
    const head = new THREE.Group();
    head.name = 'turretHead';
    head.position.y = 1.2;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), steel);
    dome.scale.set(1, 0.7, 1.1);
    head.add(dome);
    for (const sx of [-1, 1]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 8), std('#1e1e20', 0.3, 0.9));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(sx * 0.15, 0, 0.6);
      head.add(barrel);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: '#f00', emissive: '#ff2010', emissiveIntensity: 2.5 }));
    eye.position.set(0, 0.15, 0.42);
    head.add(eye);
    this.root.add(head);
    this.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    TURRET_CLIPS ??= [
      makeClip('idle', 4, { turretHead: [[0, 0, 0, 0], [1, 0, 0.5, 0], [3, 0, -0.5, 0], [4, 0, 0, 0]] }),
      makeClip('walk', 1, { turretHead: [[0, 0, 0, 0], [1, 0, 0, 0]] }),
      makeClip('attack', 0.4, { turretHead: [[0, 0, 0, 0], [0.05, -0.15, 0, 0], [0.4, 0, 0, 0]] }),
      makeClip('hit', 0.3, { turretHead: [[0, 0, 0, 0], [0.1, 0.1, 0.2, 0], [0.3, 0, 0, 0]] }),
      makeClip('death', 0.8, { turretHead: [[0, 0, 0, 0], [0.8, 0.9, 0.3, 0.4]] }),
    ];
    this.setupAnimations(this.root, TURRET_CLIPS);
  }
}

// ─── Робот-охранник ─────────────────────────────────────────────────────────

let ROBOT_CLIPS: THREE.AnimationClip[] | null = null;

/** Охранный робот на гусеницах: корпус с куполом-«мозгом» и две руки-пушки. */
export class RobotRig extends Rig {
  readonly height = 2.1;

  constructor() {
    super();
    this.cycleDistance = 1.6;
    const steel = std('#5a5e58', 0.45, 0.75);
    const dark = std('#2a2c2c', 0.6, 0.6);
    const base = new THREE.Group();
    base.name = 'chassis';
    for (const sx of [-1, 1]) {
      const tread = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 10), dark);
      tread.rotation.x = Math.PI / 2;
      tread.position.set(sx * 0.45, 0.25, 0);
      base.add(tread);
    }
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1), steel);
    hull.position.y = 0.45;
    base.add(hull);
    this.root.add(base);

    const torso = new THREE.Group();
    torso.name = 'torso';
    torso.position.y = 0.65;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 16), steel);
    body.position.y = 0.45;
    torso.add(body);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#a8d8e8', transparent: true, opacity: 0.35, roughness: 0.05, transmission: 0.3 }));
    glass.position.y = 0.9;
    const brain = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), new THREE.MeshStandardMaterial({ color: '#d88a9a', emissive: '#6a2030', emissiveIntensity: 0.5, roughness: 0.7 }));
    brain.scale.set(1, 0.75, 1.2);
    brain.position.y = 0.98;
    const dome = new THREE.Group();
    dome.name = 'dome';
    dome.add(glass, brain);
    torso.add(dome);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.name = sx < 0 ? 'armR' : 'armL';
      arm.position.set(sx * 0.55, 0.6, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), dark);
      upper.position.y = -0.2;
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 10), steel);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(0, -0.45, 0.25);
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#f00', emissive: '#ff3010', emissiveIntensity: 2 }));
      muzzle.position.set(0, -0.45, 0.56);
      arm.add(upper, gun, muzzle);
      torso.add(arm);
    }
    this.root.add(torso);
    this.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    ROBOT_CLIPS ??= [
      makeClip('idle', 4, { dome: [[0, 0, 0, 0], [1.5, 0, 0.6, 0], [3, 0, -0.6, 0], [4, 0, 0, 0]] }, { torso: [[0, 0, 0.65, 0], [2, 0, 0.67, 0], [4, 0, 0.65, 0]] }),
      makeClip('walk', 1, { torso: [[0, 0, -0.05, 0], [0.5, 0, 0.05, 0], [1, 0, -0.05, 0]] }, { torso: [[0, 0, 0.65, 0], [0.25, 0, 0.68, 0], [0.5, 0, 0.65, 0], [0.75, 0, 0.68, 0], [1, 0, 0.65, 0]] }),
      makeClip('attack', 0.45, {
        armL: [[0, 0, 0, 0], [0.08, -0.25, 0, 0], [0.45, 0, 0, 0]],
        armR: [[0, 0, 0, 0], [0.12, -0.25, 0, 0], [0.45, 0, 0, 0]],
      }),
      makeClip('hit', 0.3, { torso: [[0, 0, 0, 0], [0.1, -0.15, 0.2, 0], [0.3, 0, 0, 0]] }),
      makeClip('death', 1, {
        torso: [[0, 0, 0, 0], [0.4, 0.3, 0.2, 0.3], [1, 0.9, 0.3, 0.8]],
        armL: [[0, 0, 0, 0], [1, 0.8, 0, 0.5]],
        armR: [[0, 0, 0, 0], [1, 0.6, 0, -0.4]],
      }, { torso: [[0, 0, 0.65, 0], [1, 0, 0.35, 0.2]] }),
    ];
    this.setupAnimations(this.root, ROBOT_CLIPS);
  }
}

let WANAMINGO_CLIPS: THREE.AnimationClip[] | null = null;

/** Ванаминго: слизистая тварь из шахт — сгорбленное тело, четыре лапы, длинные руки-косы и вытянутая голова со жвалами. */
export class WanamingoRig extends Rig {
  readonly height = 1.7;

  constructor(scale = 1) {
    super();
    this.cycleDistance = 1.8;
    const hide = new THREE.MeshPhysicalMaterial({ color: '#3a3f3a', roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.3 });
    const belly = std('#6a6458', 0.6);
    const claw = std('#c8c0a8', 0.4);
    const body = new THREE.Group();
    body.name = 'body';
    body.position.y = 1;
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), hide);
    torso.scale.set(0.85, 0.75, 1.45);
    torso.rotation.x = -0.35;
    const under = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), belly);
    under.scale.set(0.8, 0.5, 1.3);
    under.position.set(0, -0.18, 0.05);
    body.add(torso, under);
    // Хребет из костяных пластин.
    for (let i = 0; i < 5; i++) {
      const plate = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 5), claw);
      plate.position.set(0, 0.38 - i * 0.03, 0.45 - i * 0.24);
      plate.rotation.x = -0.6;
      body.add(plate);
    }
    // Голова: вытянутая, с жвалами-щупальцами.
    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0, 0.35, 0.7);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), hide);
    skull.scale.set(0.8, 0.7, 1.7);
    skull.position.z = 0.22;
    head.add(skull);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff8020', emissive: '#ff5010', emissiveIntensity: 2 }));
      eye.position.set(sx * 0.12, 0.08, 0.4);
      head.add(eye);
      for (const dy of [-0.06, -0.14]) {
        const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.28, 3, 6), belly);
        t.position.set(sx * 0.07, dy, 0.6);
        t.rotation.x = Math.PI / 2 + 0.4;
        t.rotation.z = sx * 0.3;
        head.add(t);
      }
    }
    body.add(head);
    // Руки-косы.
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.name = sx < 0 ? 'armR' : 'armL';
      arm.position.set(sx * 0.38, 0.15, 0.45);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.55, 4, 8), hide);
      upper.position.set(0, -0.2, 0.15);
      upper.rotation.x = 0.9;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 6), claw);
      blade.position.set(0, -0.55, 0.42);
      blade.rotation.x = 2.2;
      arm.add(upper, blade);
      body.add(arm);
    }
    // Хвост.
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), hide);
    tail.name = 'tail';
    tail.rotation.x = -Math.PI / 2 - 0.3;
    tail.position.set(0, -0.05, -0.95);
    body.add(tail);
    this.root.add(body);
    // Четыре лапы.
    const legs: [string, number, number][] = [['legFL', -1, 0.35], ['legFR', 1, 0.35], ['legBL', -1, -0.4], ['legBR', 1, -0.4]];
    for (const [name, sx, z] of legs) {
      const leg = new THREE.Group();
      leg.name = name;
      leg.position.set(sx * 0.32, 0.95, z);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.45, 4, 8), hide);
      thigh.position.set(sx * 0.12, -0.25, 0);
      thigh.rotation.z = sx * 0.5;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), hide);
      shin.position.set(sx * 0.22, -0.68, 0);
      shin.rotation.z = -sx * 0.15;
      leg.add(thigh, shin);
      this.root.add(leg);
    }
    this.root.scale.setScalar(scale);
    this.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    const swing = (a: number) => [[0, a, 0, 0], [0.3, -a, 0, 0], [0.6, a, 0, 0]] as [number, number, number, number][];
    WANAMINGO_CLIPS ??= [
      makeClip('idle', 2.4, {
        head: [[0, 0, 0, 0], [0.8, 0.1, 0.3, 0], [1.6, -0.05, -0.3, 0], [2.4, 0, 0, 0]],
        tail: [[0, -Math.PI / 2 - 0.3, 0, 0], [1.2, -Math.PI / 2 - 0.3, 0.4, 0], [2.4, -Math.PI / 2 - 0.3, 0, 0]],
      }, { body: [[0, 0, 1, 0], [1.2, 0, 1.04, 0], [2.4, 0, 1, 0]] }),
      makeClip('walk', 0.6, {
        legFL: swing(0.5), legBR: swing(0.5), legFR: swing(-0.5), legBL: swing(-0.5),
        armL: [[0, 0.2, 0, 0], [0.3, -0.2, 0, 0], [0.6, 0.2, 0, 0]],
        armR: [[0, -0.2, 0, 0], [0.3, 0.2, 0, 0], [0.6, -0.2, 0, 0]],
      }, { body: [[0, 0, 1, 0], [0.15, 0, 1.05, 0], [0.3, 0, 1, 0], [0.45, 0, 1.05, 0], [0.6, 0, 1, 0]] }),
      makeClip('attack', 0.5, {
        body: [[0, 0, 0, 0], [0.15, 0.25, 0, 0], [0.5, 0, 0, 0]],
        armL: [[0, 0, 0, 0], [0.12, -1.2, 0, 0], [0.25, 0.6, 0, 0], [0.5, 0, 0, 0]],
        armR: [[0, 0, 0, 0], [0.15, -1.2, 0, 0], [0.3, 0.6, 0, 0], [0.5, 0, 0, 0]],
      }),
      makeClip('hit', 0.3, { body: [[0, 0, 0, 0], [0.1, -0.3, 0.2, 0], [0.3, 0, 0, 0]] }),
      makeClip('death', 1, {
        body: [[0, 0, 0, 0], [0.5, 0.2, 0, 0.6], [1, 0.1, 0, 1.4]],
        legFL: [[0, 0, 0, 0], [1, 0.9, 0, 0.5]], legFR: [[0, 0, 0, 0], [1, 0.7, 0, -0.4]],
        armL: [[0, 0, 0, 0], [1, -0.8, 0, 0.4]],
      }, { body: [[0, 0, 1, 0], [1, 0.2, 0.4, 0]] }),
    ];
    this.setupAnimations(this.root, WANAMINGO_CLIPS);
  }
}
