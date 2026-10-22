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
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDanger: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDanger;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= vec3(1.06, 1.0, 0.9);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 0.88);
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
    this.scene.add(new THREE.HemisphereLight(0xb9cde8, 0x7a5a40, 0.9));

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
    this.sun.position.copy(target).addScaledVector(this.sunDir, 90);
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
