import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { ParticleSystem } from './particles';

/** Цветокоррекция «выжженной пустоши»: тёплый сдвиг, лёгкая десатурация, виньетка, плёночное зерно. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDanger: { value: 0 }, uNight: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDanger;
    uniform float uNight;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= mix(vec3(1.06, 1.0, 0.9), vec3(0.85, 0.95, 1.2), uNight);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, mix(0.88, 0.7, uNight));
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.3, length(d * vec2(1.1, 1.0)));
      c.rgb *= mix(0.45, 1.0, v);
      // Красная виньетка в бою.
      c.rgb = mix(c.rgb, c.rgb * vec3(1.15, 0.75, 0.7), uDanger * (1.0 - v) * 0.8);
      float n = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * 0.025 * (l + 0.1);
      gl_FragColor = c;
    }
  `,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3();
  private composer: EffectComposer;
  private grade: ShaderPass;
  private bloom: UnrealBloomPass;
  readonly sky: Sky;
  private hemi: THREE.HemisphereLight;
  private stars: THREE.Points;
  /** Направление на светило, отбрасывающее тени (солнце днём, луна ночью). */
  private lightDir = new THREE.Vector3();
  private horizon = new THREE.Color();
  /** 0 — день, 1 — глубокая ночь. */
  night = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.3, 6000);

    // Небо с атмосферным рассеянием, закатное солнце.
    const sky = new Sky();
    this.sky = sky;
    sky.scale.setScalar(5000);
    const u = sky.material.uniforms;
    u.turbidity.value = 9;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.008;
    u.mieDirectionalG.value = 0.86;
    const elevation = THREE.MathUtils.degToRad(24);
    const azimuth = THREE.MathUtils.degToRad(215);
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);

    // Окружение для PBR-отражений из того же неба.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) {
      envSky.material.uniforms[k].value = u[k].value;
    }
    envScene.add(envSky);
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.scene.fog = new THREE.FogExp2(0xc9a27e, 0.0065);

    this.sun = new THREE.DirectionalLight(0xffd2a0, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -32;
    sc.right = 32;
    sc.top = 32;
    sc.bottom = -32;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xb9cde8, 0x7a5a40, 0.9);
    this.scene.add(this.hemi);

    // Звёзды: точки на большой сфере, видны только ночью.
    const starPos: number[] = [];
    for (let i = 0; i < 1800; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < 0.02) v.y = Math.abs(v.y) + 0.02;
      v.normalize().multiplyScalar(3000);
      starPos.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    this.lightDir.copy(this.sunDir);

    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Тень следует за точкой интереса (игроком), чтобы карта теней оставалась чёткой. */
  followShadow(target: THREE.Vector3) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.lightDir, 90);
    this.stars.position.copy(this.camera.position);
  }

  /** Освещение помещения: без неба, холодный рассеянный свет сверху, тёмный туман. */
  setIndoor() {
    this.night = 0.6;
    this.sky.visible = false;
    this.lightDir.set(0.15, 1, 0.25).normalize();
    this.sun.color.set(0xc8d8ff);
    this.sun.intensity = 0.9;
    this.hemi.intensity = 0.55;
    this.hemi.color.set(0x8090b0);
    this.hemi.groundColor.set(0x202228);
    this.scene.environmentIntensity = 0.12;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(0x07080a);
    fog.density = 0.02;
    this.scene.background = fog.color;
    (this.stars.material as THREE.PointsMaterial).opacity = 0;
    this.renderer.toneMappingExposure = 1.05;
    this.grade.uniforms.uNight.value = 0.35;
  }

  /** Время суток в часах (0..24): положение солнца, цвет света, туман, звёзды. */
  setTime(hour: number) {
    const t = (hour - 5) / 15;
    const elev = Math.sin(t * Math.PI) * 62;
    const az = THREE.MathUtils.degToRad(110 + 180 * t);
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), az);
    this.sky.visible = true;
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    const day = THREE.MathUtils.smoothstep(elev, -6, 10);
    const warm = 1 - THREE.MathUtils.smoothstep(elev, 4, 30);
    this.night = 1 - day;

    if (elev > -2) {
      // Днём тени от солнца, на закате свет тёплый и длинные тени.
      this.lightDir.copy(this.sunDir);
      if (this.lightDir.y < 0.08) this.lightDir.y = 0.08;
      this.lightDir.normalize();
      this.sun.color.set(0xfff0dc).lerp(new THREE.Color(0xff8a48), warm);
      this.sun.intensity = 3.1 * THREE.MathUtils.smoothstep(elev, -2, 8);
    } else {
      // Ночью тот же источник играет роль луны.
      this.lightDir.set(-this.sunDir.x, Math.max(0.5, -this.sunDir.y), -this.sunDir.z).normalize();
      this.sun.color.set(0x8aa4ff);
      this.sun.intensity = 0.8 * THREE.MathUtils.smoothstep(-elev, 2, 12);
    }
    this.hemi.intensity = 0.3 + 0.6 * day;
    this.hemi.color.set(0x34446e).lerp(new THREE.Color(0xb9cde8), day);
    this.hemi.groundColor.set(0x1a1820).lerp(new THREE.Color(0x7a5a40), day);
    this.scene.environmentIntensity = 0.03 + 0.32 * day;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(0x121828).lerp(new THREE.Color(0xc9a27e), day).lerp(new THREE.Color(0xc4704e), warm * day * 0.6);
    fog.density = 0.0065 + 0.004 * this.night;
    // Фон — цвет неба у горизонта: его видно в отражениях воды вместо пересвеченного Sky.
    this.horizon.set(0x101828).lerp(new THREE.Color(0x7d9cb8), day).lerp(fog.color, 0.35 + warm * 0.3);
    this.scene.background = this.horizon;
    (this.stars.material as THREE.PointsMaterial).opacity = THREE.MathUtils.smoothstep(this.night, 0.5, 1);
    this.renderer.toneMappingExposure = 0.85 + 0.55 * this.night;
    this.grade.uniforms.uNight.value = this.night;
  }

  set danger(v: number) { this.grade.uniforms.uDanger.value = v; }
  get danger() { return this.grade.uniforms.uDanger.value; }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    ParticleSystem.scaleUniform.value = h * this.renderer.getPixelRatio() * 0.5;
  }

  render(time: number) {
    this.grade.uniforms.uTime.value = time % 100;
    this.composer.render();
  }
}
