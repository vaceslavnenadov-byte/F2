import * as THREE from 'three';

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`;

const frag = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

export interface EmitParams {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  size: number;
  color: THREE.Color;
  /** Размер в конце жизни (множитель). */
  grow?: number;
  alpha?: number;
}

/** Простая GPU-система частиц: огонь, пыль, кровь, искры. */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly cap: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly grow: Float32Array;
  private readonly alpha: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private cursor = 0;
  static readonly scaleUniform = { value: 600 };

  constructor(cap: number, blending: THREE.Blending, private gravity = 0, private drag = 0) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.baseSize = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.baseAlpha = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uScale: ParticleSystem.scaleUniform },
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(p: EmitParams) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.pos.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
    this.vel.set([p.vel.x, p.vel.y, p.vel.z], i * 3);
    this.col.set([p.color.r, p.color.g, p.color.b], i * 3);
    this.baseSize[i] = p.size;
    this.grow[i] = p.grow ?? 1;
    this.baseAlpha[i] = p.alpha ?? 1;
    this.life[i] = p.life;
    this.maxLife[i] = p.life;
  }

  update(dt: number) {
    const damp = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const k = i * 3;
      this.vel[k + 1] -= this.gravity * dt;
      this.vel[k] *= damp;
      this.vel[k + 1] *= damp;
      this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] = this.baseSize[i] * (1 + (this.grow[i] - 1) * t);
      // Плавное появление и исчезновение.
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, t * 6) * (1 - t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
}
