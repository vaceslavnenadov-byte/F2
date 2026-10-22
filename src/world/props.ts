import * as THREE from 'three';
import type { World } from './world';

/** Винтокрыл Анклава: фюзеляж, крыло с поворотными двигателями, хвост. Длина ~12 м. */
export function vertibird(w: World): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: '#2e3236', roughness: 0.45, metalness: 0.75, normalMap: w.mat.stone.normalMap });
  const glass = new THREE.MeshStandardMaterial({ color: '#10202a', roughness: 0.05, metalness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 6, 8, 20), hull);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.85);
  body.position.y = 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 2.3, 4.1);
  g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 1.8), hull);
  wing.position.set(0, 3.3, 0.4);
  g.add(wing);
  for (const sx of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.6, 16), hull);
    nacelle.position.set(sx * 5.6, 3.6, 0.4);
    g.add(nacelle);
    const rotor = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.05, 0.3), hull);
      blade.rotation.y = (k / 3) * Math.PI * 2;
      blade.position.y = 0;
      const pivot = new THREE.Group();
      pivot.rotation.y = (k / 3) * Math.PI * 2;
      blade.position.x = 2.1;
      blade.rotation.y = 0;
      pivot.add(blade);
      rotor.add(pivot);
    }
    rotor.position.set(sx * 5.6, 4.95, 0.4);
    rotor.rotation.y = sx * 0.4;
    g.add(rotor);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 5, 12), hull);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 2.6, -6);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 1.4), hull);
  fin.position.set(0, 3.8, -8.2);
  g.add(fin);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 1), hull);
  tailWing.position.set(0, 4.8, -8.3);
  g.add(tailWing);
  for (const [x, z] of [[-1, 2.5], [1, 2.5], [-1, -2], [1, -2]]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), w.mat.metal);
    skid.position.set(x, 0.5, z);
    g.add(skid);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: '#f00', emissive: '#ff2010', emissiveIntensity: 3 }));
  light.position.set(0, 5, -8.3);
  g.add(light);
  return g;
}

/** Ржавый нефтяной танкер. Длина ~56 м, нос смотрит в +Z. */
export function tanker(w: World): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#4a2620', roughness: 0.8, metalness: 0.4, normalMap: w.mat.stone.normalMap });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#5a5650', roughness: 0.85, metalness: 0.3 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#c8c2b4', roughness: 0.7 });
  // Корпус: силуэт сбоку с заострённым носом, выдавленный по ширине.
  const shape = new THREE.Shape();
  shape.moveTo(-28, -6);
  shape.lineTo(22, -6);
  shape.quadraticCurveTo(29, -5, 30, 3);
  shape.lineTo(-28, 3);
  shape.lineTo(-28, -6);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 14, bevelEnabled: false });
  geo.translate(0, 0, -7);
  geo.rotateY(-Math.PI / 2);
  const hull = new THREE.Mesh(geo, hullMat);
  g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.3, 54), deckMat);
  deck.position.set(0, 3.1, -1);
  g.add(deck);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 8), whiteMat);
  bridge.position.set(0, 6.7, -22);
  g.add(bridge);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.9, 8.1), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffcf80', emissiveIntensity: 0.6 }));
  windows.position.set(0, 9, -22);
  g.add(windows);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 5, 16), hullMat);
  funnel.position.set(0, 12.5, -24);
  g.add(funnel);
  // Трубопроводы и люки на палубе.
  for (let i = 0; i < 5; i++) {
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.6, 16), deckMat);
    hatch.position.set(i % 2 ? 3 : -3, 3.5, -10 + i * 7);
    g.add(hatch);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 40, 8), w.mat.rust);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0, 3.6, 4);
  g.add(pipe);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = o.receiveShadow = true) : null));
  return g;
}

/** Металлический настил палубы с ограждением по краям. */
export function deck(w: World, x: number, z: number, hw: number, hd: number, h: number, rails = true) {
  const mat = new THREE.MeshStandardMaterial({ color: '#5c6066', roughness: 0.55, metalness: 0.6, normalMap: w.mat.stone.normalMap });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.3, hd * 2), mat);
  plate.position.set(x, h - 0.12, z);
  plate.receiveShadow = true;
  w.group.add(plate);
  // Опоры уходят в воду.
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, h + 12, 12), w.mat.rust);
    leg.position.set(x + ox * (hw - 0.8), (h - 12) / 2, z + oz * (hd - 0.8));
    leg.castShadow = true;
    w.group.add(leg);
  }
  if (!rails) return;
  const railMat = new THREE.MeshStandardMaterial({ color: '#c8a020', roughness: 0.5, metalness: 0.4 });
  const edges: [number, number, number, number][] = [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), railMat);
    rail.position.set(x + (ax + bx) / 2, h + 1, z + (az + bz) / 2);
    rail.rotation.y = -Math.atan2(bz - az, bx - ax);
    w.group.add(rail);
    for (let i = 0; i <= Math.ceil(len / 2); i++) {
      const t = i / Math.ceil(len / 2);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), railMat);
      post.position.set(x + ax + (bx - ax) * t, h + 0.5, z + az + (bz - az) * t);
      w.group.add(post);
    }
  }
}

/** Портовый кран-укосина. */
export function crane(w: World): THREE.Group {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: '#b08a20', roughness: 0.6, metalness: 0.4 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), yellow);
  tower.position.y = 7;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 16), yellow);
  jib.position.set(0, 14, 5);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), yellow);
  cab.position.set(0, 13, 0);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 4), w.mat.metal);
  cable.position.set(0, 10, 12);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12, Math.PI * 1.4), w.mat.metal);
  hook.position.set(0, 5.8, 12);
  g.add(tower, jib, cab, cable, hook);
  return g;
}

/** Морской контейнер. */
export function container(color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.4 }));
  m.position.y = 1.3;
  return m;
}

/** «Хайвеймен»: довоенный седан с хвостовыми плавниками. Нос смотрит в +Z, длина ~5 м. */
export function highwayman(w: World, broken = false): THREE.Group {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: broken ? '#3a2a24' : '#1a1a1e', roughness: broken ? 0.8 : 0.25, metalness: 0.6, clearcoat: broken ? 0 : 0.8 });
  const stripe = new THREE.MeshStandardMaterial({ color: '#a01818', roughness: 0.4, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.15, metalness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: '#203040', roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.75 });
  // Силуэт кузова сбоку, выдавленный по ширине.
  const side = new THREE.Shape();
  side.moveTo(-2.5, 0.35);
  side.lineTo(2.4, 0.35);
  side.quadraticCurveTo(2.65, 0.4, 2.6, 0.85);
  side.lineTo(1.2, 0.95);
  side.lineTo(-1.9, 0.95);
  side.lineTo(-2.55, 1.15);
  side.lineTo(-2.6, 0.6);
  side.lineTo(-2.5, 0.35);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(side, { depth: 1.9, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }), paint);
  body.geometry.translate(0, 0, -0.95);
  body.rotation.y = -Math.PI / 2;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.8), glass);
  cabin.position.set(0, 1.2, -0.1);
  g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 1.5), paint);
  roof.position.set(0, 1.48, -0.15);
  g.add(roof);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.12, 4.9), stripe);
  band.position.set(0, 0.72, 0);
  g.add(band);
  for (const z of [2.62, -2.62]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.18, 0.15), chrome);
    bumper.position.set(0, 0.45, z);
    g.add(bumper);
  }
  for (const sx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 14), new THREE.MeshStandardMaterial({ color: '#fff4d0', emissive: broken ? '#000' : '#ffe0a0', emissiveIntensity: 1.2 }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(sx, 0.7, 2.62);
    g.add(lamp);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.9), paint);
    fin.position.set(sx * 1.35, 1.05, -2.1);
    fin.rotation.x = -0.25;
    g.add(fin);
  }
  for (const [x, z] of [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.6], [0.95, -1.6]]) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 10, 20), w.mat.rubber);
    tire.rotation.y = Math.PI / 2;
    tire.position.set(x, 0.38, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 14), chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.38, z);
    g.add(tire, hub);
  }
  if (broken) {
    g.rotation.z = 0.04;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 1.2), paint);
    hood.position.set(0, 1.25, 1.9);
    hood.rotation.x = -0.9;
    g.add(hood);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = o.receiveShadow = true) : null));
  return g;
}
