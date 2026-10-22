// Таймеры на игровом времени: анимации и ходы в бою ждут их через await.
type Timer = { t: number; resolve: () => void };

const timers: Timer[] = [];

export function wait(sec: number): Promise<void> {
  return new Promise((resolve) => timers.push({ t: sec, resolve }));
}

export function tickTimers(dt: number): void {
  for (let i = timers.length - 1; i >= 0; i--) {
    const tm = timers[i];
    tm.t -= dt;
    if (tm.t <= 0) {
      timers.splice(i, 1);
      tm.resolve();
    }
  }
}
