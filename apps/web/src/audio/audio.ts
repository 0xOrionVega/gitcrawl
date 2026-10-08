/**
 * Tiny WebAudio synth: every sound effect and the chiptune music are generated
 * on the fly. No audio files, no licensing questions.
 */
import type { ThemeMusic } from '@gitcrawl/shared';
import { storage } from '../util/storage';

export type Sfx =
  | 'swing'
  | 'hit'
  | 'kill'
  | 'goblin'
  | 'ghost'
  | 'skeleton'
  | 'slime'
  | 'arrow'
  | 'hammer'
  | 'hurt'
  | 'pickup'
  | 'chest'
  | 'door'
  | 'locked'
  | 'pit'
  | 'ding'
  | 'roar'
  | 'bosshit'
  | 'shoot'
  | 'heal'
  | 'victory'
  | 'death'
  | 'crate'
  | 'quest'
  | 'powerup'
  | 'click'
  | 'talk';

const SCALES: Record<ThemeMusic['scale'], number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  pentatonic: [0, 3, 5, 7, 10, 12, 15],
};

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private recordOut: MediaStreamAudioDestinationNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlayed = new Map<Sfx, number>();
  muted = storage.get('muted') === '1';
  private music: MusicPlayer | null = null;
  private pendingMusic: { theme: ThemeMusic; boss: boolean } | null = null;
  private listeners = new Set<(muted: boolean) => void>();

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.42;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      if (this.pendingMusic) {
        const p = this.pendingMusic;
        this.pendingMusic = null;
        this.playMusic(p.theme, p.boss);
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /**
   * Audio track for clip recording. Tapped before the mute control, so clips
   * keep their sound even when the player has muted the game.
   */
  recordingTrack(): MediaStreamTrack | null {
    if (!this.ctx || typeof this.ctx.createMediaStreamDestination !== 'function') return null;
    if (!this.recordOut) {
      this.recordOut = this.ctx.createMediaStreamDestination();
      const tap = this.ctx.createGain();
      tap.gain.value = 0.9;
      this.sfxBus.connect(tap);
      this.musicBus.connect(tap);
      tap.connect(this.recordOut);
    }
    return this.recordOut.stream.getAudioTracks()[0] ?? null;
  }

  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  onMuteChange(fn: (muted: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    storage.set('muted', muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    this.listeners.forEach((fn) => fn(muted));
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  playMusic(theme: ThemeMusic, boss = false) {
    if (!this.ctx) {
      this.pendingMusic = { theme, boss };
      return;
    }
    this.music?.stop();
    this.music = new MusicPlayer(this.ctx, this.musicBus, () => this.noiseBuf!, theme, boss);
    this.music.start();
  }

  stopMusic() {
    this.pendingMusic = null;
    this.music?.stop();
    this.music = null;
  }

  // ------------------------------------------------------------------ primitives
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = 0, attack = 0.004) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, when = 0, q = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private arp(notes: number[], step: number, type: OscillatorType, vol: number, dur = step * 1.6) {
    notes.forEach((f, i) => this.tone(type, f, f, dur, vol, i * step));
  }

  play(name: Sfx) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    // Rate-limit identical sounds so crowds don't clip.
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < 45) return;
    this.lastPlayed.set(name, now);
    switch (name) {
      case 'swing':
        this.noise(0.09, 0.32, 'bandpass', 2200, 700, 0, 1.5);
        break;
      case 'hit':
        this.tone('square', 540, 190, 0.07, 0.16);
        this.noise(0.05, 0.2, 'lowpass', 2500, 600);
        break;
      case 'kill':
        this.tone('square', 640, 70, 0.2, 0.18);
        this.noise(0.18, 0.25, 'lowpass', 1800, 200);
        break;
      case 'goblin':
        this.tone('square', 900, 1500, 0.06, 0.1);
        this.tone('square', 1300, 700, 0.07, 0.1, 0.06);
        break;
      case 'ghost':
        this.tone('sine', 720, 330, 0.55, 0.14);
        this.tone('sine', 760, 360, 0.55, 0.06, 0.03);
        break;
      case 'skeleton':
        for (let i = 0; i < 4; i++) this.noise(0.025, 0.3, 'highpass', 3000, 3000, i * 0.045);
        break;
      case 'slime':
        this.tone('sine', 320, 110, 0.16, 0.25);
        break;
      case 'arrow':
        this.noise(0.07, 0.22, 'highpass', 3500, 1400);
        break;
      case 'hammer':
        this.tone('sine', 130, 38, 0.3, 0.6);
        this.noise(0.22, 0.35, 'lowpass', 900, 120);
        break;
      case 'hurt':
        this.tone('square', 230, 100, 0.2, 0.2);
        this.noise(0.1, 0.15, 'lowpass', 1200, 300);
        break;
      case 'pickup':
        this.arp([880, 1320], 0.06, 'square', 0.1);
        break;
      case 'chest':
        this.arp([523, 659, 784, 1047], 0.07, 'triangle', 0.22);
        break;
      case 'door':
        this.noise(0.05, 0.3, 'bandpass', 600, 600, 0, 3);
        this.arp([392, 523, 659], 0.08, 'triangle', 0.2);
        break;
      case 'locked':
        this.tone('square', 160, 150, 0.12, 0.18);
        this.tone('square', 150, 140, 0.14, 0.18, 0.15);
        break;
      case 'pit':
        this.tone('sine', 1000, 70, 1.3, 0.2);
        break;
      case 'ding':
        this.tone('sine', 1320, 1320, 0.7, 0.18);
        this.tone('sine', 1760, 1760, 0.5, 0.1, 0.02);
        break;
      case 'roar':
        this.tone('sawtooth', 120, 60, 0.9, 0.28);
        this.tone('square', 90, 55, 0.9, 0.12);
        this.noise(0.9, 0.3, 'lowpass', 900, 150);
        break;
      case 'bosshit':
        this.tone('square', 210, 120, 0.1, 0.2);
        this.noise(0.08, 0.2, 'bandpass', 1500, 500);
        break;
      case 'shoot':
        this.tone('square', 760, 280, 0.09, 0.09);
        break;
      case 'heal':
        this.arp([523, 659, 784, 1047, 1319], 0.05, 'triangle', 0.18);
        break;
      case 'victory':
        this.arp([523, 659, 784, 1047], 0.11, 'square', 0.12, 0.2);
        this.arp([784, 1047, 1319, 1568], 0.11, 'triangle', 0.16, 0.25);
        this.tone('triangle', 1047, 1047, 0.9, 0.15, 0.5);
        this.tone('square', 1319, 1319, 0.9, 0.06, 0.5);
        break;
      case 'death':
        this.arp([392, 330, 262, 196], 0.17, 'square', 0.14, 0.3);
        break;
      case 'crate':
        this.noise(0.14, 0.35, 'bandpass', 900, 400, 0, 2);
        this.tone('sine', 180, 80, 0.12, 0.25);
        break;
      case 'quest':
        this.arp([659, 784, 988, 1319], 0.08, 'triangle', 0.2);
        break;
      case 'powerup':
        this.arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.04, 'square', 0.08);
        break;
      case 'click':
        this.tone('square', 1200, 1100, 0.025, 0.06);
        break;
      case 'talk':
        this.tone('square', 600 + Math.random() * 200, 500, 0.04, 0.05);
        break;
    }
  }
}

/** Lookahead-scheduled chiptune loop: bass, arpeggio, drums and a seeded lead motif. */
class MusicPlayer {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private readonly stepDur: number;
  private readonly scale: number[];
  private readonly root: number;
  private readonly lead: OscillatorType;
  private readonly progression: number[];
  private readonly motif: (number | null)[];
  private readonly out: GainNode;

  constructor(
    private ctx: AudioContext,
    bus: GainNode,
    private noise: () => AudioBuffer,
    theme: ThemeMusic,
    private boss: boolean,
  ) {
    const bpm = boss ? Math.round(theme.bpm * 1.28) : theme.bpm;
    this.stepDur = 60 / bpm / 4;
    this.scale = SCALES[boss ? 'harmonicMinor' : theme.scale];
    this.root = boss ? theme.root - 2 : theme.root;
    this.lead = boss ? 'sawtooth' : theme.lead;
    this.progression = boss ? [0, 5, 1, 4] : theme.progression;
    // A small deterministic motif per theme.
    let seed = theme.root * 7 + theme.bpm;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    this.motif = Array.from({ length: 32 }, (_, i) => (i % 4 === 0 || rand() < 0.35 ? Math.floor(rand() * 7) : null));
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    this.out.connect(bus);
  }

  start() {
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.15);
    const out = this.out;
    window.setTimeout(() => out.disconnect(), 800);
  }

  private note(degree: number, octave = 0): number {
    const len = this.scale.length;
    const idx = ((degree % len) + len) % len;
    const oct = Math.floor(degree / len) + octave;
    return this.root + this.scale[idx] + 12 * oct;
  }

  private voice(type: OscillatorType, midi: number, t: number, dur: number, vol: number) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(midiToHz(midi), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private drum(kind: 'kick' | 'snare' | 'hat', t: number) {
    if (kind === 'kick') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g).connect(this.out);
      osc.start(t);
      osc.stop(t + 0.18);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const flt = this.ctx.createBiquadFilter();
    flt.type = kind === 'hat' ? 'highpass' : 'bandpass';
    flt.frequency.value = kind === 'hat' ? 7000 : 1800;
    const g = this.ctx.createGain();
    const vol = kind === 'hat' ? 0.12 : 0.35;
    const dur = kind === 'hat' ? 0.03 : 0.12;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.01);
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.14) {
      const t = this.nextTime;
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % this.progression.length;
      const chord = this.progression[bar];
      // bass: 8ths, root/fifth
      if (s % 2 === 0) this.voice('triangle', this.note(chord + (s % 8 === 4 ? 4 : 0), -2), t, this.stepDur * 1.8, 0.5);
      // arpeggio: chord tones on 16ths
      const arpDeg = [0, 2, 4, 2][s % 4] + chord;
      this.voice(this.lead === 'sawtooth' ? 'square' : 'square', this.note(arpDeg, 1), t, this.stepDur * 0.8, 0.07);
      // lead motif every other loop
      const loop = Math.floor(this.step / (16 * this.progression.length));
      if (loop % 2 === 1 || this.boss) {
        const m = this.motif[this.step % 32];
        if (m !== null && s % 2 === 0) this.voice(this.lead, this.note(chord + m, 1), t, this.stepDur * 1.9, this.boss ? 0.09 : 0.1);
      }
      // drums
      if (s === 0 || s === 8 || (this.boss && (s === 4 || s === 12))) this.drum('kick', t);
      if (s === 4 || s === 12) this.drum('snare', t);
      if (s % 2 === 1 || this.boss) this.drum('hat', t);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }
}

export const audio = new AudioEngine();
