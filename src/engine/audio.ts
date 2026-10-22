// Процедурный звук: всё синтезируется через Web Audio, без аудиофайлов.

export type Sfx = 'geiger' | 'step' | 'swing' | 'miss' | 'hit' | 'shot' | 'bite' | 'death' | 'click' | 'levelup' | 'quest' | 'heal' | 'coins' | 'hurt';
export type MusicMode = 'explore' | 'combat' | 'off';

const A_MINOR_PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76]; // MIDI
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  private wind!: { gain: GainNode; filter: BiquadFilterNode };
  private fireGain!: GainNode;
  private cricketsGain!: GainNode;
  private musicMode: MusicMode = 'explore';
  private nextChord = 0;
  private nextPluck = 0;
  private nextBeat = 0;
  private beatIndex = 0;
  private muted = false;
  /** Позиция «ушей» — центр камеры. */
  listener = { x: 0, z: 0 };
  night = 0;

  /** Контекст создаётся только после жеста пользователя (политика браузеров). */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6);
    const revGain = ctx.createGain();
    revGain.gain.value = 0.35;
    this.reverb.connect(revGain).connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverb);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.25;
    this.sfxBus.connect(sfxSend).connect(this.reverb);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.5;
    this.ambBus.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Ветер: шум через полосовой фильтр с медленно гуляющей частотой.
    const windSrc = this.loopNoise();
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 400;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.18;
    windSrc.connect(wf).connect(wg).connect(this.ambBus);
    this.wind = { gain: wg, filter: wf };

    // Треск костра: шум через высокочастотный фильтр, громкость — по расстоянию до огня.
    const fireSrc = this.loopNoise();
    const ff = ctx.createBiquadFilter();
    ff.type = 'highpass';
    ff.frequency.value = 2500;
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    fireSrc.connect(ff).connect(this.fireGain).connect(this.ambBus);

    this.cricketsGain = ctx.createGain();
    this.cricketsGain.gain.value = 0;
    this.cricketsGain.connect(this.ambBus);

    this.applyVolumes();
    const t = ctx.currentTime;
    this.nextChord = t + 0.5;
    this.nextPluck = t + 2;
    this.nextBeat = t + 0.2;
    window.setInterval(() => this.schedule(), 100);
  }

  get ready() { return !!this.ctx; }

  private volumes = { master: 0.8, music: 0.6, sfx: 0.8 };

  /** Громкость из настроек (0..1); применяется сразу или при запуске звука. */
  setVolumes(v: { master: number; music: number; sfx: number }) {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.05);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  setMusic(mode: MusicMode) {
    if (mode === this.musicMode || !this.ctx) {
      this.musicMode = mode;
      return;
    }
    this.musicMode = mode;
    const t = this.ctx.currentTime;
    this.nextBeat = t + 0.1;
    this.beatIndex = 0;
    this.nextChord = t + 0.1;
  }

  /** Окружение: ночь (0..1) и расстояние до ближайшего огня. */
  updateAmbience(night: number, fireDist: number, time: number) {
    if (!this.ctx) return;
    this.night = night;
    const t = this.ctx.currentTime;
    this.wind.filter.frequency.setTargetAtTime(300 + Math.sin(time * 0.13) * 180 + Math.sin(time * 0.31) * 90, t, 0.5);
    this.wind.gain.gain.setTargetAtTime(0.12 + 0.08 * (0.5 + 0.5 * Math.sin(time * 0.21)), t, 0.5);
    const fire = Math.max(0, 1 - fireDist / 9);
    this.fireGain.gain.setTargetAtTime(fire * 0.05 * (0.6 + Math.random() * 0.8), t, 0.03);
    this.cricketsGain.gain.setTargetAtTime(night * 0.06, t, 1);
  }

  // ─── Звуковые эффекты ────────────────────────────────────────────────────

  play(name: Sfx, at?: { x: number; z: number }, vol = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (at) vol *= Math.max(0, 1 - Math.hypot(at.x - this.listener.x, at.z - this.listener.z) / 35);
    if (vol <= 0.01) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = vol;
    if (at) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (at.x - this.listener.x) / 15));
      out.connect(pan).connect(this.sfxBus);
    } else out.connect(this.sfxBus);

    switch (name) {
      case 'geiger':
        this.noiseBurst(out, t, 0.012, 'highpass', 3000, 0.5, 0.001);
        break;
      case 'step':
        this.noiseBurst(out, t, 0.07, 'lowpass', 600 + Math.random() * 300, 0.25);
        break;
      case 'swing':
      case 'miss':
        this.sweep(out, t, 0.25, 2500, 500, name === 'miss' ? 0.18 : 0.3);
        break;
      case 'hit':
        this.noiseBurst(out, t, 0.12, 'lowpass', 900, 0.6);
        this.tone(out, t, 0.18, 120, 50, 'sine', 0.7);
        break;
      case 'bite':
        this.noiseBurst(out, t, 0.08, 'bandpass', 1800, 0.4);
        this.noiseBurst(out, t + 0.07, 0.06, 'bandpass', 1400, 0.35);
        break;
      case 'shot':
        this.noiseBurst(out, t, 0.35, 'lowpass', 3500, 1.0, 0.002);
        this.tone(out, t, 0.25, 150, 40, 'sine', 0.9);
        break;
      case 'hurt':
        this.tone(out, t, 0.25, 220, 140, 'sawtooth', 0.12);
        break;
      case 'death':
        this.tone(out, t, 0.9, 180, 45, 'sawtooth', 0.18);
        this.noiseBurst(out, t + 0.1, 0.5, 'lowpass', 400, 0.3);
        break;
      case 'click':
        this.tone(out, t, 0.05, 1800, 1200, 'square', 0.05);
        break;
      case 'heal':
        [0, 0.08, 0.16].forEach((d, i) => this.tone(out, t + d, 0.25, midi(72 + i * 4), midi(72 + i * 4), 'sine', 0.15));
        break;
      case 'coins':
        [0, 0.05, 0.11].forEach((d) => this.tone(out, t + d, 0.12, 2400 + Math.random() * 800, 2000, 'triangle', 0.12));
        break;
      case 'levelup':
        [60, 64, 67, 72, 76].forEach((n, i) => this.tone(out, t + i * 0.09, 0.5, midi(n), midi(n), 'triangle', 0.18));
        break;
      case 'quest':
        [67, 72, 76].forEach((n, i) => this.tone(out, t + i * 0.14, 0.7, midi(n), midi(n), 'sine', 0.2));
        break;
    }
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }

  private impulse(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private noiseBurst(out: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, vol: number, attack = 0.005) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private sweep(out: AudioNode, t: number, dur: number, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(out: AudioNode, t: number, dur: number, f0: number, f1: number, type: OscillatorType, vol: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ─── Музыка ──────────────────────────────────────────────────────────────

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const ahead = ctx.currentTime + 0.4;
    // Сверчки ночью: короткие высокие трели.
    if (this.night > 0.3 && Math.random() < 0.3) {
      const t = ctx.currentTime + Math.random() * 0.1;
      const f = 4200 + Math.random() * 600;
      for (let k = 0; k < 3; k++) this.tone(this.cricketsGain, t + k * 0.045, 0.03, f, f, 'sine', 0.5);
    }
    if (this.musicMode === 'off') return;
    if (this.musicMode === 'explore') {
      while (this.nextChord < ahead) {
        this.pad(this.nextChord, 9);
        this.nextChord += 8;
      }
      while (this.nextPluck < ahead) {
        const n = A_MINOR_PENTA[Math.floor(Math.random() * A_MINOR_PENTA.length)];
        this.pluck(this.nextPluck, midi(n), 0.09);
        // Изредка — эхо-ответ на октаву ниже.
        if (Math.random() < 0.3) this.pluck(this.nextPluck + 0.375, midi(n - 12), 0.06);
        this.nextPluck += (this.night > 0.5 ? 2.4 : 1.4) + Math.random() * 2.5;
      }
    } else {
      const beat = 60 / 104 / 2;
      while (this.nextBeat < ahead) {
        const i = this.beatIndex++ % 16;
        if (i % 4 === 0) this.drum(this.nextBeat, 1);
        if (i === 6 || i === 14) this.drum(this.nextBeat, 0.6);
        if (i % 2 === 0) this.bass(this.nextBeat, midi([45, 45, 46, 45, 48, 45, 46, 44][(i / 2) % 8]), beat * 1.8);
        if (i % 8 === 4) this.noiseBurst(this.musicBus, this.nextBeat, 0.1, 'highpass', 6000, 0.08);
        if (i === 0 && this.beatIndex % 64 === 1) this.pad(this.nextBeat, 4, [57, 58, 64]);
        this.nextBeat += beat;
      }
    }
  }

  private pad(t: number, dur: number, notes?: number[]) {
    const ctx = this.ctx!;
    const roots = [[45, 52, 57, 60], [43, 50, 55, 59], [41, 48, 53, 57], [40, 47, 52, 55]];
    const chord = notes ?? roots[Math.floor(Math.random() * roots.length)];
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(900, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g).connect(this.musicBus);
    for (const n of chord) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  private pluck(t: number, freq: number, vol: number) {
    this.tone(this.musicBus, t, 1.6, freq, freq * 0.998, 'triangle', vol, 0.004);
  }

  private drum(t: number, vol: number) {
    this.tone(this.musicBus, t, 0.35, 110, 38, 'sine', 0.5 * vol, 0.002);
    this.noiseBurst(this.musicBus, t, 0.08, 'lowpass', 300, 0.15 * vol);
  }

  private bass(t: number, freq: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(150, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

export const audio = new AudioEngine();
