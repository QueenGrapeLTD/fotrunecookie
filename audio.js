// Web Audio API Synthesizer for Fortune Cookie Sound Effects
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playCrack() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + 0.008;

    // Two muted, pitched clicks suggest a crisp biscuit opening without noise.
    [0, 0.042].forEach((delay, index) => {
      const click = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      const clickFilter = this.ctx.createBiquadFilter();
      const start = now + delay;
      click.type = 'triangle';
      click.frequency.setValueAtTime(index === 0 ? 540 : 680, start);
      click.frequency.exponentialRampToValueAtTime(
        index === 0 ? 360 : 440,
        start + 0.055,
      );
      clickFilter.type = 'lowpass';
      clickFilter.frequency.setValueAtTime(1450, start);
      clickGain.gain.setValueAtTime(index === 0 ? 0.075 : 0.055, start);
      clickGain.gain.exponentialRampToValueAtTime(0.001, start + 0.075);
      click.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(this.ctx.destination);
      click.start(start);
      click.stop(start + 0.08);
    });

    // A soft pentatonic glass shimmer follows the opening animation.
    [783.99, 987.77, 1174.66].forEach((frequency, index) => {
      const chime = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      const start = now + 0.075 + index * 0.065;
      chime.type = 'sine';
      chime.frequency.setValueAtTime(frequency, start);
      chimeGain.gain.setValueAtTime(0.0001, start);
      chimeGain.gain.exponentialRampToValueAtTime(0.032, start + 0.018);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, start + 0.52);
      chime.connect(chimeGain);
      chimeGain.connect(this.ctx.destination);
      chime.start(start);
      chime.stop(start + 0.54);
    });
  }

  playChime() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.6);
    });
  }
}

export const soundManager = new SoundManager();
