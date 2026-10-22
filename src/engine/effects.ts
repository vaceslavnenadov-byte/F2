import * as THREE from 'three';
import { ParticleSystem } from './particles';
import type { Actor } from '../entities/actor';

/** Боевые эффекты: брызги крови, вспышка выстрела, пыль от шагов. */
export class Effects {
  readonly blood = new ParticleSystem(300, THREE.NormalBlending, 9, 1);
  readonly sparks = new ParticleSystem(200, THREE.AdditiveBlending, 2, 3);
  private flash: THREE.PointLight;
  private flashT = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.blood.points, this.sparks.points);
    this.flash = new THREE.PointLight(0xffc070, 0, 10, 2);
    scene.add(this.flash);
  }

  hit(target: Actor, from: THREE.Vector3, color = new THREE.Color(0.45, 0.03, 0.02)) {
    const p = target.pos.clone().setY(target.pos.y + target.rig.height * 0.6);
    const dir = p.clone().sub(from).setY(0).normalize();
    for (let i = 0; i < 26; i++) {
      this.blood.emit({
        pos: p,
        vel: new THREE.Vector3(
          dir.x * 2 + (Math.random() - 0.5) * 2.5,
          1 + Math.random() * 2.5,
          dir.z * 2 + (Math.random() - 0.5) * 2.5,
        ),
        life: 0.5 + Math.random() * 0.4,
        size: 0.09 + Math.random() * 0.08,
        color,
      });
    }
  }

  muzzle(shooter: Actor, target: Actor) {
    const dir = target.pos.clone().sub(shooter.pos).setY(0).normalize();
    const p = shooter.pos.clone().addScaledVector(dir, 0.7).setY(shooter.pos.y + 1.35);
    this.flash.position.copy(p);
    this.flash.intensity = 25;
    this.flashT = 0.08;
    const c = new THREE.Color(5, 3, 1);
    for (let i = 0; i < 14; i++) {
      this.sparks.emit({
        pos: p,
        vel: dir.clone().multiplyScalar(4 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)),
        life: 0.12 + Math.random() * 0.1,
        size: 0.12,
        color: c,
      });
    }
  }

  update(dt: number) {
    this.blood.update(dt);
    this.sparks.update(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
  }
}
