/**
 * Studio-grade procedural Web Audio engine for Minato City.
 * Uses layered filtered noise bursts, soft-clipped transient shaping,
 * synthetic urban concrete convolution reverb, formant vocal filters,
 * stereo night rain, and warm 1980s City Pop FM/Rhodes chords — zero chiptune beeps.
 */

import type { MusicIntensity } from './types';

export type SoundEffectKind =
  | 'rifle'
  | 'smg'
  | 'heavy'
  | 'sniper'
  | 'railgun'
  | 'explosion'
  | 'grenadeThrow'
  | 'flare'
  | 'roll'
  | 'medBeacon'
  | 'rally'
  | 'pickup'
  | 'ricochet'
  | 'fleshHit'
  | 'playerHurt'
  | 'spitterCharge'
  | 'tankRoar'
  | 'tankSlam'
  | 'victory'
  | 'defeat'
  | 'switchUnit'
  | 'reloadStart'
  | 'reloadPerfect'
  | 'reloadJam'
  | 'barrelHit'
  | 'generatorOnline'
  | 'stanceOrder'
  | 'ammoCrate';

export interface PlaySoundOptions {
  pan?: number;
  gainScale?: number;
}

export class MinatoAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private combatStemGain: GainNode | null = null;
  private bossStemGain: GainNode | null = null;
  private distCurve: Float32Array<ArrayBuffer> | null = null;

  private whiteBuffer: AudioBuffer | null = null;
  private pinkBuffer: AudioBuffer | null = null;
  private brownBuffer: AudioBuffer | null = null;

  private muted = false;
  private musicEnabled = true;
  private musicIntensity: MusicIntensity = 'ambient';
  private rainStarted = false;
  private musicTimer: number | null = null;
  private beatStep = 0;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.setupGraph();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.rainStarted && this.ctx) {
      this.startRainBed();
      this.startCityPopAmbience();
      this.rainStarted = true;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.85, this.ctx.currentTime, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicEnabled ? 0.24 : 0, this.ctx.currentTime, 0.25);
    }
    return this.musicEnabled;
  }

  public setMusicIntensity(intensity: MusicIntensity): void {
    if (this.musicIntensity === intensity) return;
    this.musicIntensity = intensity;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.combatStemGain) {
      const targetCombat = intensity === 'combat' || intensity === 'boss' ? 1.0 : 0.0;
      this.combatStemGain.gain.setTargetAtTime(targetCombat, now, 0.45);
    }
    if (this.bossStemGain) {
      const targetBoss = intensity === 'boss' ? 1.0 : 0.0;
      this.bossStemGain.gain.setTargetAtTime(targetBoss, now, 0.35);
    }
  }

  public setPaused(paused: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted ? 0 : paused ? 0.16 : 0.85;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  public dispose(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private setupGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.85;
    this.masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1.0;
    this.sfxBus.connect(this.masterGain);

    // Urban concrete canyon impulse response (early street reflections + damp tail)
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = this.buildUrbanReverbIR(ctx, 1.45);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.34;
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(this.masterGain);

    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.14;
    this.rainGain.connect(this.masterGain);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicEnabled ? 0.24 : 0;
    this.musicGain.connect(this.masterGain);

    // Stem 2 (Combat 80s drum groove & funk bass) + Stem 3 (Boss FM brass & overdrive hats)
    this.combatStemGain = ctx.createGain();
    this.combatStemGain.gain.value =
      this.musicIntensity === 'combat' || this.musicIntensity === 'boss' ? 1.0 : 0.0;
    this.combatStemGain.connect(this.musicGain);

    this.bossStemGain = ctx.createGain();
    this.bossStemGain.gain.value = this.musicIntensity === 'boss' ? 1.0 : 0.0;
    this.bossStemGain.connect(this.musicGain);

    this.whiteBuffer = this.buildNoiseBuffer(ctx, 'white', 2.0);
    this.pinkBuffer = this.buildNoiseBuffer(ctx, 'pink', 3.0);
    this.brownBuffer = this.buildNoiseBuffer(ctx, 'brown', 3.0);
    this.distCurve = this.buildSoftClipCurve(256, 3.2);
  }

  private buildUrbanReverbIR(ctx: AudioContext, durationSec: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const ir = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, 2.8);
        const white = Math.random() * 2 - 1;
        // Progressive high-frequency air absorption
        lp = lp * (0.62 + t * 0.32) + white * (0.38 - t * 0.32);
        // Subtle street-wall slapback echoes at ~42ms and ~95ms
        const slap =
          (Math.abs(i - Math.floor(rate * 0.042)) < 90 ? 0.55 : 0) +
          (Math.abs(i - Math.floor(rate * 0.098)) < 120 ? 0.28 : 0);
        data[i] = (lp * env + white * slap * 0.35) * 0.7;
      }
    }
    return ir;
  }

  private buildNoiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const out = buf.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      let lastBrown = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'white') {
          out[i] = w;
        } else if (color === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          lastBrown = (lastBrown + 0.025 * w) / 1.025;
          out[i] = Math.max(-1, Math.min(1, lastBrown * 3.4));
        }
      }
    }
    return buf;
  }

  private buildSoftClipCurve(samples: number, drive: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive);
    }
    return curve;
  }

  private startRainBed(): void {
    if (!this.ctx || !this.pinkBuffer || !this.brownBuffer || !this.rainGain) return;
    const ctx = this.ctx;

    // Fine wet-asphalt rain shimmer
    const drizzle = ctx.createBufferSource();
    drizzle.buffer = this.pinkBuffer;
    drizzle.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1850;
    bp.Q.value = 0.55;
    const dg = ctx.createGain();
    dg.gain.value = 0.42;
    drizzle.connect(bp);
    bp.connect(dg);
    dg.connect(this.rainGain);
    drizzle.start();

    // Deep city night rumble / distant bay surf
    const cityLow = ctx.createBufferSource();
    cityLow.buffer = this.brownBuffer;
    cityLow.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    const lg = ctx.createGain();
    lg.gain.value = 0.65;
    cityLow.connect(lp);
    lp.connect(lg);
    lg.connect(this.rainGain);
    cityLow.start();
  }

  private startCityPopAmbience(): void {
    if (!this.ctx || !this.musicGain) return;
    // Synchronized 112 BPM 3-stem 1980s Japanese City Pop groove (8th-note grid = 268ms/step)
    // Progression: Fmaj9 -> Em7 -> Dm9 -> Cmaj9 (16 steps = 2 bars per chord)
    const chords = [
      [174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj9
      [164.81, 196.0, 246.94, 293.66, 392.0], // Em7
      [146.83, 174.61, 220.0, 261.63, 329.63], // Dm9
      [130.81, 164.81, 196.0, 246.94, 293.66], // Cmaj9
    ];
    const leadMelody = [
      523.25, 0, 587.33, 659.25, 0, 587.33, 523.25, 440.0,
      493.88, 0, 587.33, 659.25, 783.99, 0, 659.25, 587.33,
    ];

    const stepGroove = () => {
      if (!this.ctx || !this.musicGain || !this.reverbSend || this.ctx.state !== 'running') return;
      if (this.muted || !this.musicEnabled) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const step = this.beatStep;
      this.beatStep++;

      const barStep = step % 16;
      const chordIdx = Math.floor(step / 16) % chords.length;
      const chord = chords[chordIdx];

      // STEM 1 (AMBIENT — ALWAYS ON): Warm 1980s Rhodes 9th voicings + deep analog sub root on bar start
      if (barStep === 0) {
        const bass = ctx.createOscillator();
        const bassFilt = ctx.createBiquadFilter();
        const bassGain = ctx.createGain();
        bass.type = 'triangle';
        bass.frequency.setValueAtTime(chord[0] * 0.5, now);
        bassFilt.type = 'lowpass';
        bassFilt.frequency.setValueAtTime(240, now);
        bassGain.gain.setValueAtTime(0.0001, now);
        bassGain.gain.linearRampToValueAtTime(0.18, now + 0.12);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 3.6);
        bass.connect(bassFilt);
        bassFilt.connect(bassGain);
        bassGain.connect(this.musicGain);
        bass.start(now);
        bass.stop(now + 3.7);

        chord.forEach((freq, idx) => {
          if (!this.musicGain || !this.reverbSend) return;
          const start = now + idx * 0.04;
          const osc = ctx.createOscillator();
          const tine = ctx.createOscillator();
          const filt = ctx.createBiquadFilter();
          const g = ctx.createGain();
          const tineG = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq * (1 + (Math.random() - 0.5) * 0.003), start);
          tine.type = 'sine';
          tine.frequency.setValueAtTime(freq * 2.0, start);

          filt.type = 'lowpass';
          filt.frequency.setValueAtTime(1650, start);
          filt.frequency.exponentialRampToValueAtTime(520, start + 3.0);

          g.gain.setValueAtTime(0.0001, start);
          g.gain.linearRampToValueAtTime(0.055, start + 0.035);
          g.gain.exponentialRampToValueAtTime(0.001, start + 3.6);

          tineG.gain.setValueAtTime(0.018, start);
          tineG.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

          osc.connect(filt);
          tine.connect(tineG);
          tineG.connect(filt);
          filt.connect(g);
          g.connect(this.musicGain);
          g.connect(this.reverbSend);

          osc.start(start);
          tine.start(start);
          osc.stop(start + 3.7);
          tine.stop(start + 0.48);
        });
      }

      // STEM 2 (COMBAT DRIVE): 80s LinnDrum gated kick/snare + syncopated funk synth bassline
      if (this.combatStemGain && this.musicIntensity !== 'ambient') {
        const subStep = barStep % 8;
        // Kick on 0, 3, 4 (classic City Pop driving bounce)
        if (subStep === 0 || subStep === 3 || subStep === 4) {
          const kick = ctx.createOscillator();
          const kg = ctx.createGain();
          kick.type = 'sine';
          kick.frequency.setValueAtTime(118, now);
          kick.frequency.exponentialRampToValueAtTime(38, now + 0.11);
          kg.gain.setValueAtTime(0.28, now);
          kg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          kick.connect(kg);
          kg.connect(this.combatStemGain);
          kick.start(now);
          kick.stop(now + 0.14);
        }
        // Gated 1980s Snare on 2 & 6
        if ((subStep === 2 || subStep === 6) && this.whiteBuffer) {
          const sn = ctx.createBufferSource();
          sn.buffer = this.whiteBuffer;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1800;
          bp.Q.value = 0.85;
          const sg = ctx.createGain();
          sg.gain.setValueAtTime(0.16, now);
          sg.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
          sn.connect(bp);
          bp.connect(sg);
          sg.connect(this.combatStemGain);
          if (this.reverbSend) sg.connect(this.reverbSend);
          sn.start(now, Math.random() * 0.8, 0.13);
        }
        // Crisp 8th-note closed hi-hat
        if (this.whiteBuffer) {
          const hh = ctx.createBufferSource();
          hh.buffer = this.whiteBuffer;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 7200;
          const hg = ctx.createGain();
          hg.gain.setValueAtTime(subStep % 2 === 0 ? 0.055 : 0.032, now);
          hg.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
          hh.connect(hp);
          hp.connect(hg);
          hg.connect(this.combatStemGain);
          hh.start(now, Math.random() * 1.2, 0.045);
        }
        // Syncopated FM slap-bass pluck on steps 0, 2, 3, 5, 6
        if (subStep === 0 || subStep === 2 || subStep === 3 || subStep === 5 || subStep === 6) {
          const oct = subStep === 2 || subStep === 6 ? 1.0 : 0.5;
          const fb = ctx.createOscillator();
          const fFilt = ctx.createBiquadFilter();
          const fGain = ctx.createGain();
          fb.type = 'sawtooth';
          fb.frequency.setValueAtTime(chord[0] * oct, now);
          fFilt.type = 'lowpass';
          fFilt.frequency.setValueAtTime(1150, now);
          fFilt.frequency.exponentialRampToValueAtTime(220, now + 0.16);
          fGain.gain.setValueAtTime(0.12, now);
          fGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          fb.connect(fFilt);
          fFilt.connect(fGain);
          fGain.connect(this.combatStemGain);
          fb.start(now);
          fb.stop(now + 0.2);
        }
      }

      // STEM 3 (BOSS OVERDRIVE): Soaring 1980s FM synth-brass counter-melody + octave tension pulse
      if (this.bossStemGain && this.musicIntensity === 'boss') {
        const note = leadMelody[barStep];
        if (note > 0) {
          const lead = ctx.createOscillator();
          const lead2 = ctx.createOscillator();
          const lp = ctx.createBiquadFilter();
          const lg = ctx.createGain();
          lead.type = 'sawtooth';
          lead.frequency.setValueAtTime(note, now);
          lead2.type = 'triangle';
          lead2.frequency.setValueAtTime(note * 1.004, now);
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(2600, now);
          lp.frequency.exponentialRampToValueAtTime(860, now + 0.24);
          lg.gain.setValueAtTime(0.001, now);
          lg.gain.linearRampToValueAtTime(0.085, now + 0.02);
          lg.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          lead.connect(lp);
          lead2.connect(lp);
          lp.connect(lg);
          lg.connect(this.bossStemGain);
          if (this.reverbSend) lg.connect(this.reverbSend);
          lead.start(now);
          lead2.start(now);
          lead.stop(now + 0.28);
          lead2.stop(now + 0.28);
        }
      }
    };

    stepGroove();
    this.musicTimer = window.setInterval(stepGroove, 268);
  }

  private createSpatialOut(ctx: AudioContext, opts?: PlaySoundOptions): AudioNode {
    const dest = this.sfxBus!;
    const pan = opts?.pan ?? 0;
    const gainScale = opts?.gainScale ?? 1;
    if (Math.abs(pan) < 0.03 && Math.abs(gainScale - 1) < 0.02) {
      return dest;
    }
    const g = ctx.createGain();
    g.gain.value = Math.max(0.15, Math.min(1.25, gainScale));
    if (typeof ctx.createStereoPanner === 'function' && Math.abs(pan) >= 0.03) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.88, Math.min(0.88, pan));
      g.connect(panner);
      panner.connect(dest);
    } else {
      g.connect(dest);
    }
    return g;
  }

  public play(kind: SoundEffectKind, opts?: PlaySoundOptions): void {
    if (this.muted || !this.ctx || !this.sfxBus || !this.reverbSend) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.16;
    const savedSfxBus = this.sfxBus;
    const spatialOut = this.createSpatialOut(ctx, opts);
    this.sfxBus = spatialOut as GainNode;
    try {

    switch (kind) {
      case 'rifle':
        this.playFirearm(ctx, now, {
          thumpStart: 125 * jitter,
          thumpEnd: 34,
          thumpDur: 0.085,
          thumpGain: 0.32,
          bodyFreq: 920 * jitter,
          bodyQ: 0.9,
          bodyDur: 0.11,
          bodyGain: 0.28,
          crackFreq: 3100 * jitter,
          crackDur: 0.032,
          crackGain: 0.24,
          reverbAmt: 0.42,
          mechPing: 3900 * jitter,
        });
        break;

      case 'smg':
        this.playFirearm(ctx, now, {
          thumpStart: 145 * jitter,
          thumpEnd: 46,
          thumpDur: 0.055,
          thumpGain: 0.22,
          bodyFreq: 1350 * jitter,
          bodyQ: 1.2,
          bodyDur: 0.075,
          bodyGain: 0.2,
          crackFreq: 4200 * jitter,
          crackDur: 0.022,
          crackGain: 0.19,
          reverbAmt: 0.28,
          mechPing: 4800 * jitter,
        });
        break;

      case 'heavy':
        this.playFirearm(ctx, now, {
          thumpStart: 105 * jitter,
          thumpEnd: 24,
          thumpDur: 0.14,
          thumpGain: 0.45,
          bodyFreq: 560 * jitter,
          bodyQ: 0.7,
          bodyDur: 0.16,
          bodyGain: 0.36,
          crackFreq: 2100 * jitter,
          crackDur: 0.045,
          crackGain: 0.26,
          reverbAmt: 0.56,
          mechPing: 2400 * jitter,
        });
        break;

      case 'sniper':
        this.playFirearm(ctx, now, {
          thumpStart: 150 * jitter,
          thumpEnd: 22,
          thumpDur: 0.24,
          thumpGain: 0.55,
          bodyFreq: 760 * jitter,
          bodyQ: 0.6,
          bodyDur: 0.26,
          bodyGain: 0.42,
          crackFreq: 4600 * jitter,
          crackDur: 0.06,
          crackGain: 0.38,
          reverbAmt: 0.85,
          mechPing: 5200 * jitter,
        });
        break;

      case 'railgun':
        this.playRailgun(ctx, now);
        break;

      case 'explosion':
        this.playExplosion(ctx, now);
        break;

      case 'grenadeThrow':
        this.playWhoosh(ctx, now, 580, 190, 0.18, 0.18);
        break;

      case 'flare':
        this.playFlareIgnite(ctx, now);
        break;

      case 'roll':
        this.playWhoosh(ctx, now, 340, 120, 0.22, 0.24);
        break;

      case 'medBeacon':
        this.playWarmChord(ctx, now, [293.66, 369.99, 440.0, 554.37], 0.9, 0.13);
        break;

      case 'rally':
        this.playWarmChord(ctx, now, [261.63, 329.63, 392.0, 523.25], 0.75, 0.15);
        break;

      case 'pickup':
        this.playWarmChord(ctx, now, [392.0, 493.88, 587.33], 0.45, 0.11);
        break;

      case 'ricochet':
        this.playRicochet(ctx, now, jitter);
        break;

      case 'fleshHit':
        this.playFleshHit(ctx, now, jitter);
        break;

      case 'playerHurt':
        this.playPlayerHurt(ctx, now);
        break;

      case 'spitterCharge':
        this.playAcidCharge(ctx, now);
        break;

      case 'tankRoar':
        this.playFormantRoar(ctx, now, 78, 0.85, 0.36);
        break;

      case 'tankSlam':
        this.playExplosion(ctx, now, 0.82);
        break;

      case 'victory':
        this.playWarmChord(ctx, now, [261.63, 329.63, 392.0, 493.88, 587.33], 1.6, 0.16);
        break;

      case 'defeat':
        this.playWarmChord(ctx, now, [146.83, 174.61, 207.65, 261.63], 1.5, 0.16);
        break;

      case 'switchUnit':
        this.playTacticalClick(ctx, now);
        break;

      case 'reloadStart':
        this.playReloadMagClick(ctx, now);
        break;

      case 'reloadPerfect':
        this.playReloadPerfect(ctx, now);
        break;

      case 'reloadJam':
        this.playReloadJam(ctx, now);
        break;

      case 'barrelHit':
        this.playBarrelClang(ctx, now, jitter);
        break;

      case 'generatorOnline':
        this.playGeneratorOnline(ctx, now);
        break;

      case 'stanceOrder':
        this.playStanceOrder(ctx, now);
        break;

      case 'ammoCrate':
        this.playAmmoCrate(ctx, now);
        break;
    }
    } finally {
      this.sfxBus = savedSfxBus;
    }
  }

  private playFirearm(
    ctx: AudioContext,
    now: number,
    spec: {
      thumpStart: number;
      thumpEnd: number;
      thumpDur: number;
      thumpGain: number;
      bodyFreq: number;
      bodyQ: number;
      bodyDur: number;
      bodyGain: number;
      crackFreq: number;
      crackDur: number;
      crackGain: number;
      reverbAmt: number;
      mechPing: number;
    },
  ): void {
    if (!this.whiteBuffer || !this.pinkBuffer || !this.sfxBus || !this.reverbSend) return;

    const bus = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    if (this.distCurve) shaper.curve = this.distCurve;
    bus.connect(shaper);
    shaper.connect(this.sfxBus);

    const revG = ctx.createGain();
    revG.gain.value = spec.reverbAmt;
    shaper.connect(revG);
    revG.connect(this.reverbSend);

    // 1. Sub-bass chamber pressure thump
    const sub = ctx.createOscillator();
    const subG = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(spec.thumpStart, now);
    sub.frequency.exponentialRampToValueAtTime(spec.thumpEnd, now + spec.thumpDur);
    subG.gain.setValueAtTime(spec.thumpGain, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + spec.thumpDur);
    sub.connect(subG);
    subG.connect(bus);
    sub.start(now);
    sub.stop(now + spec.thumpDur + 0.02);

    // 2. Gunpowder blast body (filtered pink noise)
    const body = ctx.createBufferSource();
    body.buffer = this.pinkBuffer;
    const bodyFilt = ctx.createBiquadFilter();
    bodyFilt.type = 'bandpass';
    bodyFilt.frequency.setValueAtTime(spec.bodyFreq, now);
    bodyFilt.frequency.exponentialRampToValueAtTime(spec.bodyFreq * 0.35, now + spec.bodyDur);
    bodyFilt.Q.value = spec.bodyQ;
    const bodyG = ctx.createGain();
    bodyG.gain.setValueAtTime(spec.bodyGain, now);
    bodyG.gain.exponentialRampToValueAtTime(0.001, now + spec.bodyDur);
    body.connect(bodyFilt);
    bodyFilt.connect(bodyG);
    bodyG.connect(bus);
    body.start(now, Math.random() * 1.2, spec.bodyDur + 0.03);

    // 3. Supersonic crack transient (high-passed white noise)
    const crack = ctx.createBufferSource();
    crack.buffer = this.whiteBuffer;
    const crackFilt = ctx.createBiquadFilter();
    crackFilt.type = 'highpass';
    crackFilt.frequency.setValueAtTime(spec.crackFreq, now);
    const crackG = ctx.createGain();
    crackG.gain.setValueAtTime(spec.crackGain, now);
    crackG.gain.exponentialRampToValueAtTime(0.001, now + spec.crackDur);
    crack.connect(crackFilt);
    crackFilt.connect(crackG);
    crackG.connect(bus);
    crack.start(now, Math.random() * 1.0, spec.crackDur + 0.02);

    // 4. Subtle metallic bolt/action transient
    const mech = ctx.createBufferSource();
    mech.buffer = this.whiteBuffer;
    const mechFilt = ctx.createBiquadFilter();
    mechFilt.type = 'bandpass';
    mechFilt.frequency.setValueAtTime(spec.mechPing, now + 0.014);
    mechFilt.Q.value = 6.5;
    const mechG = ctx.createGain();
    mechG.gain.setValueAtTime(0.0001, now);
    mechG.gain.setValueAtTime(0.08, now + 0.014);
    mechG.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
    mech.connect(mechFilt);
    mechFilt.connect(mechG);
    mechG.connect(this.sfxBus);
    mech.start(now, Math.random() * 0.8, 0.06);
  }

  private playRailgun(ctx: AudioContext, now: number): void {
    this.playFirearm(ctx, now, {
      thumpStart: 180,
      thumpEnd: 20,
      thumpDur: 0.32,
      thumpGain: 0.65,
      bodyFreq: 950,
      bodyQ: 0.5,
      bodyDur: 0.34,
      bodyGain: 0.45,
      crackFreq: 3800,
      crackDur: 0.08,
      crackGain: 0.45,
      reverbAmt: 0.95,
      mechPing: 6200,
    });
    if (!this.sfxBus || !this.reverbSend) return;
    // Electromagnetic capacitor discharge sweep
    const em = ctx.createOscillator();
    const emG = ctx.createGain();
    em.type = 'sawtooth';
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.setValueAtTime(2200, now);
    lp.frequency.exponentialRampToValueAtTime(220, now + 0.35);
    lp.Q.value = 3.0;
    em.frequency.setValueAtTime(1400, now);
    em.frequency.exponentialRampToValueAtTime(110, now + 0.36);
    emG.gain.setValueAtTime(0.18, now);
    emG.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    em.connect(lp);
    lp.connect(emG);
    emG.connect(this.sfxBus);
    emG.connect(this.reverbSend);
    em.start(now);
    em.stop(now + 0.4);
  }

  private playExplosion(ctx: AudioContext, now: number, scale = 1.0): void {
    if (!this.brownBuffer || !this.whiteBuffer || !this.sfxBus || !this.reverbSend) return;

    // 1. Sub-bass shockwave
    const sub = ctx.createOscillator();
    const subG = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(78, now);
    sub.frequency.exponentialRampToValueAtTime(18, now + 0.62);
    subG.gain.setValueAtTime(0.75 * scale, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
    sub.connect(subG);
    subG.connect(this.sfxBus);
    sub.start(now);
    sub.stop(now + 0.72);

    // 2. Rolling blast rumble (brown noise through sweeping lowpass)
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.brownBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1250, now);
    lp.frequency.exponentialRampToValueAtTime(95, now + 0.85);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.68 * scale, now);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 0.92);
    rumble.connect(lp);
    lp.connect(rg);
    rg.connect(this.sfxBus);
    rg.connect(this.reverbSend);
    rumble.start(now, Math.random() * 1.2, 0.96);

    // 3. Sharp concrete/glass debris crackles
    for (let i = 0; i < 4; i++) {
      const delay = 0.04 + i * 0.075 + Math.random() * 0.04;
      const deb = ctx.createBufferSource();
      deb.buffer = this.whiteBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 + Math.random() * 2400;
      bp.Q.value = 1.8;
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.14 * scale, now + delay);
      dg.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.08);
      deb.connect(bp);
      bp.connect(dg);
      dg.connect(this.reverbSend);
      deb.start(now + delay, Math.random() * 1.0, 0.1);
    }
  }

  private playFlareIgnite(ctx: AudioContext, now: number): void {
    if (!this.whiteBuffer || !this.sfxBus || !this.reverbSend) return;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1900, now);
    bp.frequency.exponentialRampToValueAtTime(3400, now + 0.16);
    bp.frequency.exponentialRampToValueAtTime(1600, now + 0.65);
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    src.start(now, Math.random() * 0.8, 0.74);
  }

  private playWhoosh(ctx: AudioContext, now: number, fStart: number, fEnd: number, dur: number, gain: number): void {
    if (!this.pinkBuffer || !this.sfxBus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(fStart, now);
    bp.frequency.exponentialRampToValueAtTime(fEnd, now + dur);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(gain, now + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(now, Math.random(), dur + 0.04);
  }

  private playRicochet(ctx: AudioContext, now: number, jitter: number): void {
    if (!this.sfxBus || !this.reverbSend) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3600 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(980 * jitter, now + 0.14);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  private playFleshHit(ctx: AudioContext, now: number, jitter: number): void {
    if (!this.brownBuffer || !this.sfxBus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380 * jitter;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(now, Math.random() * 1.4, 0.08);
  }

  private playPlayerHurt(ctx: AudioContext, now: number): void {
    if (!this.brownBuffer || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  private playAcidCharge(ctx: AudioContext, now: number): void {
    if (!this.pinkBuffer || !this.sfxBus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(520, now);
    bp.frequency.exponentialRampToValueAtTime(2100, now + 0.45);
    bp.Q.value = 4.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.2, now + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(now, Math.random(), 0.52);
  }

  private playFormantRoar(ctx: AudioContext, now: number, baseFreq: number, dur: number, gain: number): void {
    if (!this.sfxBus || !this.reverbSend) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq * 1.15, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + dur);

    // Dual vowel formant filters for organic monster growl
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(420, now);
    f1.frequency.linearRampToValueAtTime(260, now + dur);
    f1.Q.value = 3.5;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1050, now);
    f2.frequency.linearRampToValueAtTime(720, now + dur);
    f2.Q.value = 4.0;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(f1);
    osc.connect(f2);
    f1.connect(g);
    f2.connect(g);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  private playWarmChord(ctx: AudioContext, now: number, freqs: number[], dur: number, gain: number): void {
    if (!this.sfxBus || !this.reverbSend) return;
    freqs.forEach((f, idx) => {
      const t0 = now + idx * 0.035;
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t0);
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, t0);
      lp.frequency.exponentialRampToValueAtTime(600, t0 + dur);
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(gain / freqs.length, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.sfxBus!);
      g.connect(this.reverbSend!);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    });
  }

  private playTacticalClick(ctx: AudioContext, now: number): void {
    if (!this.whiteBuffer || !this.sfxBus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 5.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(now, Math.random() * 0.5, 0.04);
  }

  private playReloadMagClick(ctx: AudioContext, now: number): void {
    if (!this.whiteBuffer || !this.sfxBus) return;
    // Magazine eject latch + hollow polymer slide
    [0, 0.075].forEach((off, idx) => {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteBuffer!;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = idx === 0 ? 1950 : 1250;
      bp.Q.value = 3.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(idx === 0 ? 0.14 : 0.11, now + off);
      g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.045);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus!);
      src.start(now + off, Math.random() * 0.4, 0.06);
    });
  }

  private playReloadPerfect(ctx: AudioContext, now: number): void {
    if (!this.whiteBuffer || !this.sfxBus || !this.reverbSend) return;
    // Tight two-stage bolt rack clack
    [0, 0.055].forEach((off, idx) => {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteBuffer!;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = idx === 0 ? 3200 : 4100;
      bp.Q.value = 5.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, now + off);
      g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.038);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus!);
      src.start(now + off, Math.random() * 0.4, 0.05);
    });
    // Subtle overcharge harmonic chime
    this.playWarmChord(ctx, now + 0.05, [440, 659.25], 0.28, 0.09);
  }

  private playReloadJam(ctx: AudioContext, now: number): void {
    if (!this.whiteBuffer || !this.sfxBus) return;
    // Dull metallic misfire double-clunk
    [0, 0.06].forEach((off) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now + off);
      osc.frequency.exponentialRampToValueAtTime(82, now + off + 0.07);
      g.gain.setValueAtTime(0.16, now + off);
      g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.08);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(now + off);
      osc.stop(now + off + 0.09);
    });
  }

  private playBarrelClang(ctx: AudioContext, now: number, jitter: number): void {
    if (!this.whiteBuffer || !this.sfxBus || !this.reverbSend) return;
    // Hollow steel oil-drum inharmonic modal ring + impact transient
    [285, 438, 712].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(freq * jitter * 0.96, now + 0.22);
      g.gain.setValueAtTime(idx === 0 ? 0.14 : 0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + (idx === 0 ? 0.24 : 0.15));
      osc.connect(g);
      g.connect(this.sfxBus!);
      g.connect(this.reverbSend!);
      osc.start(now);
      osc.stop(now + 0.26);
    });
    const hit = ctx.createBufferSource();
    hit.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1850 * jitter;
    bp.Q.value = 2.6;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.16, now);
    hg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    hit.connect(bp);
    bp.connect(hg);
    hg.connect(this.sfxBus);
    hit.start(now, Math.random() * 0.4, 0.05);
  }

  private playGeneratorOnline(ctx: AudioContext, now: number): void {
    if (!this.sfxBus || !this.reverbSend) return;
    // Heavy industrial relay clunk + rising turbine spin-up + bright City Pop power chord
    const turbine = ctx.createOscillator();
    const tFilt = ctx.createBiquadFilter();
    const tGain = ctx.createGain();
    turbine.type = 'sawtooth';
    turbine.frequency.setValueAtTime(58, now);
    turbine.frequency.exponentialRampToValueAtTime(220, now + 0.55);
    tFilt.type = 'lowpass';
    tFilt.frequency.setValueAtTime(280, now);
    tFilt.frequency.exponentialRampToValueAtTime(1600, now + 0.55);
    tGain.gain.setValueAtTime(0.001, now);
    tGain.gain.linearRampToValueAtTime(0.24, now + 0.08);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
    turbine.connect(tFilt);
    tFilt.connect(tGain);
    tGain.connect(this.sfxBus);
    tGain.connect(this.reverbSend);
    turbine.start(now);
    turbine.stop(now + 0.76);

    this.playWarmChord(ctx, now + 0.14, [261.63, 329.63, 392.0, 523.25, 659.25], 1.15, 0.22);
  }

  private playStanceOrder(ctx: AudioContext, now: number): void {
    if (!this.whiteBuffer || !this.sfxBus) return;
    // Crisp tactical walkie-talkie squelch + double confirmation tone
    const sq = ctx.createBufferSource();
    sq.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 3.2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.08, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    sq.connect(bp);
    bp.connect(sg);
    sg.connect(this.sfxBus);
    sq.start(now, Math.random() * 0.4, 0.05);

    [587.33, 880.0].forEach((freq, idx) => {
      const t0 = now + 0.025 + idx * 0.055;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.09, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    });
  }

  private playAmmoCrate(ctx: AudioContext, now: number): void {
    if (!this.whiteBuffer || !this.sfxBus || !this.reverbSend) return;
    // Heavy steel latch pop + brass magazine refill clatter + bright chord
    [0, 0.065, 0.12].forEach((off, idx) => {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteBuffer!;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = idx === 0 ? 1100 : idx === 1 ? 2900 : 3800;
      bp.Q.value = 4.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, now + off);
      g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.05);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus!);
      src.start(now + off, Math.random() * 0.4, 0.06);
    });
    this.playWarmChord(ctx, now + 0.08, [329.63, 440.0, 523.25, 659.25], 0.55, 0.15);
  }
}
