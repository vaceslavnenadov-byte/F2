import { fbm } from '../core/noise';
import { WORLD_MAP, DAYS_PER_UNIT, coastX } from '../world/locations';

export interface WorldMapOpts {
  pos: { x: number; y: number };
  days: number;
  discovered: string[];
  /** Город, в котором сейчас стоит игрок (null — посреди пустоши). */
  here: string | null;
  /** Машина: пока есть топливо, путь в 2.5 раза быстрее, встреч меньше. */
  vehicle?: { fuel: number; onFuel: (fuel: number) => void };
  /** Проезжая рядом с неизвестным местом, игрок его замечает. */
  onDiscover?: (id: string) => void;
  dateText: (days: number) => string;
  /** Вызывается на каждом отрезке пути; вернуть true — путь прерван встречей. */
  encounterCheck: (distance: number) => boolean;
  onEnter: (id: string, pos: { x: number; y: number }, days: number) => void;
  onEncounter: (pos: { x: number; y: number }, days: number) => void;
}

const W = 960;
const H = 640;
const SX = W / 100;
const SY = H / 66;

let background: HTMLCanvasElement | null = null;

/** Фон карты: рельеф пустоши, горные хребты, высохшие русла. Генерируется один раз. */
function drawBackground(): HTMLCanvasElement {
  if (background) return background;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.006, y * 0.006, 5, 900);
      const m = fbm(x * 0.012 + 40, y * 0.012, 4, 901);
      const ridge = 1 - Math.abs(m - 0.5) * 2;
      let r = 150 + n * 70;
      let g = 118 + n * 55;
      let b = 80 + n * 40;
      if (ridge > 0.82) {
        const k = (ridge - 0.82) / 0.18;
        r -= 60 * k;
        g -= 55 * k;
        b -= 40 * k;
      }
      const river = Math.abs(fbm(x * 0.004, y * 0.004 + 20, 3, 902) - 0.5);
      if (river < 0.012) {
        r -= 30;
        g -= 20;
        b -= 5;
      }
      // Океан на западе: глубина темнеет от берега.
      const ux = (x / W) * 100 + (fbm(x * 0.02, y * 0.02, 3, 903) - 0.5) * 3;
      const coast = coastX((y / H) * 66);
      if (ux < coast) {
        const depth = Math.min(1, (coast - ux) / 8);
        r = 70 - depth * 30 + n * 20;
        g = 92 - depth * 30 + n * 20;
        b = 96 - depth * 20 + n * 25;
      } else if (ux < coast + 0.7) {
        r = 190;
        g = 168;
        b = 120;
      }
      // Тёмные края, как на старой карте.
      const vx = x / W - 0.5;
      const vy = y / H - 0.5;
      const v = 1 - Math.min(1, (vx * vx + vy * vy) * 1.6);
      const i = (y * W + x) * 4;
      img.data[i] = r * v;
      img.data[i + 1] = g * v;
      img.data[i + 2] = b * v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(40, 30, 20, 0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += H / 13) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  background = c;
  return c;
}

export function showWorldMap(container: HTMLElement, o: WorldMapOpts): () => void {
  container.className = 'dim';
  container.innerHTML = `
    <div class="worldmap">
      <div class="wm-map"><canvas width="${W}" height="${H}"></canvas></div>
      <div class="wm-side crt">
        <div class="wm-title">КАРТА МИРА</div>
        <div class="wm-date"></div>
        <div class="wm-info"></div>
        <div class="wm-list"></div>
      </div>
    </div>`;
  const canvas = container.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const bg = drawBackground();
  const pos = { ...o.pos };
  let days = o.days;
  let here = o.here;
  let travel: { to: string; from: { x: number; y: number }; len: number; t: number } | null = null;
  let raf = 0;
  let last = performance.now();
  let alive = true;

  const info = container.querySelector<HTMLElement>('.wm-info')!;
  const list = container.querySelector<HTMLElement>('.wm-list')!;
  const date = container.querySelector<HTMLElement>('.wm-date')!;

  const renderSide = () => {
    date.textContent = o.dateText(days) + (o.vehicle ? ` · топливо ${Math.round(o.vehicle.fuel)}%` : '');
    if (travel) {
      info.textContent = `В пути: ${WORLD_MAP[travel.to].label}…`;
      list.innerHTML = '';
      return;
    }
    info.textContent = here ? `${WORLD_MAP[here].label}. ${WORLD_MAP[here].desc}` : 'Пустошь. Вокруг ни души.';
    list.innerHTML = '';
    if (here) {
      const b = document.createElement('button');
      b.textContent = `Войти: ${WORLD_MAP[here].label}`;
      b.addEventListener('click', () => finish(() => o.onEnter(here!, pos, days)));
      list.appendChild(b);
    }
    for (const id of o.discovered) {
      if (id === here) continue;
      const d = Math.hypot(WORLD_MAP[id].x - pos.x, WORLD_MAP[id].y - pos.y);
      const b = document.createElement('button');
      b.textContent = `${WORLD_MAP[id].label} — ${Math.max(1, Math.round((d * DAYS_PER_UNIT) / (o.vehicle && o.vehicle.fuel > 0 ? 2.5 : 1)))} дн.`;
      b.addEventListener('click', () => go(id));
      list.appendChild(b);
    }
  };

  const go = (id: string) => {
    if (travel) return;
    const t = WORLD_MAP[id];
    travel = { to: id, from: { ...pos }, len: Math.hypot(t.x - pos.x, t.y - pos.y), t: 0 };
    here = null;
    renderSide();
  };

  const finish = (cb: () => void) => {
    alive = false;
    cancelAnimationFrame(raf);
    cb();
  };

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 66;
    for (const id of o.discovered) {
      const p = WORLD_MAP[id];
      if (Math.hypot(p.x - x, p.y - y) < 3.5) {
        if (id === here) finish(() => o.onEnter(id, pos, days));
        else go(id);
      }
    }
  });

  const draw = (time: number) => {
    ctx.drawImage(bg, 0, 0);
    for (const id of o.discovered) {
      const p = WORLD_MAP[id];
      ctx.beginPath();
      ctx.arc(p.x * SX, p.y * SY, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120, 30, 20, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#2a0a06';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 18px Oswald, sans-serif';
      ctx.fillStyle = '#1a0e06';
      ctx.fillText(p.label.toUpperCase(), p.x * SX + 16, p.y * SY + 6);
    }
    if (travel) {
      const t = WORLD_MAP[travel.to];
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(160, 20, 10, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(travel.from.x * SX, travel.from.y * SY);
      ctx.lineTo(t.x * SX, t.y * SY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const pulse = 6 + Math.sin(time / 200) * 2;
    ctx.beginPath();
    ctx.arc(pos.x * SX, pos.y * SY, pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#58f06a';
    ctx.shadowColor = '#58f06a';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  const loop = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (travel) {
      const drive = !!o.vehicle && o.vehicle.fuel > 0;
      const speed = drive ? 2.5 : 1;
      const step = dt * 9 * speed;
      const prev = travel.t;
      travel.t = Math.min(travel.len, travel.t + step);
      if (drive) {
        o.vehicle!.fuel = Math.max(0, o.vehicle!.fuel - (travel.t - prev) * 1.1);
        o.vehicle!.onFuel(o.vehicle!.fuel);
        if (o.vehicle!.fuel <= 0) info.textContent = 'Топливо кончилось — дальше пешком.';
      }
      const t = WORLD_MAP[travel.to];
      const k = travel.len > 0 ? travel.t / travel.len : 1;
      pos.x = travel.from.x + (t.x - travel.from.x) * k;
      pos.y = travel.from.y + (t.y - travel.from.y) * k;
      days += ((travel.t - prev) * DAYS_PER_UNIT) / speed;
      date.textContent = o.dateText(days);
      for (const [id, p] of Object.entries(WORLD_MAP)) {
        if (!o.discovered.includes(id) && Math.hypot(p.x - pos.x, p.y - pos.y) < 7) {
          o.discovered.push(id);
          o.onDiscover?.(id);
        }
      }
      if (travel.t >= travel.len) {
        here = travel.to;
        travel = null;
        renderSide();
      } else if (travel.t > 3 && travel.len - travel.t > 3 && o.encounterCheck((travel.t - prev) / speed)) {
        travel = null;
        finish(() => o.onEncounter({ ...pos }, days));
        return;
      }
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  };
  renderSide();
  raf = requestAnimationFrame(loop);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}
