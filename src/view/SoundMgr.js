// 程序化音效（WebAudio 实时合成，不依赖音频文件）
// 对应原游戏 SoundMgr 按前缀分通道的思路：这里按技能配置里的 sfx id 播放
export class SoundMgr {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._last = new Map();
    this._noise = null;
  }

  /** 浏览器要求用户手势后才能出声 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    // 预生成一段白噪声
    const len = this.ctx.sampleRate * 1.5;
    this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  // ------------------------------------------------------------ 背景音乐
  /** 程序化背景音乐：D 宫五声音阶拨弦 + 低音持续音 + 每小节一声低鼓，音量很低 */
  startMusic() {
    if (!this.ctx || this._music) return;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    bus.connect(lp).connect(this.master);
    // 低音持续音
    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 73.42; // D2
    const dg = ctx.createGain();
    dg.gain.value = 0.18;
    drone.connect(dg).connect(bus);
    drone.start();
    const scale = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99]; // D 宫五声
    const beat = 0.42;
    let next = ctx.currentTime + 0.2;
    let step = 0;
    const phrase = [0, 2, 3, 5, 4, 3, 2, 0, 1, 3, 4, 6, 5, 4, 3, 1];
    const tick = () => {
      while (next < ctx.currentTime + 0.6) {
        const bar = step % 16;
        if (bar % 8 === 0) this._drum(next, bus);
        // 旋律：按乐句走，偶尔休止
        if (Math.random() < 0.72) this._pluck(next, scale[phrase[bar]] * (Math.random() < 0.15 ? 2 : 1), bus);
        if (bar % 4 === 2 && Math.random() < 0.5) this._pluck(next + beat / 2, scale[phrase[(bar + 3) % 16]], bus, 0.5);
        next += beat;
        step++;
      }
    };
    tick();
    this._music = { timer: setInterval(tick, 200), drone };
  }

  _pluck(t, f, bus, vel = 1) {
    // 拨弦：三角波 + 快速衰减 + 轻微失谐的泛音
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    g.connect(bus);
    for (const [mul, type, amp] of [[1, "triangle", 1], [2.003, "sine", 0.35], [3.01, "sine", 0.12]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.5);
    }
  }

  _drum(t, bus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.55);
  }

  play(id) {
    if (!id || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - (this._last.get(id) || 0) < 0.035) return; // 同一音效节流
    this._last.set(id, now);
    const fn = this[`_${id}`];
    if (fn) fn.call(this, now);
  }

  // ------------------------------------------------------------ 合成积木
  _env(node, t, a, peak, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
    node.connect(g).connect(this.master);
    return g;
  }

  _noiseBurst(t, { type = "bandpass", f0 = 1000, f1 = 1000, q = 1, a = 0.005, peak = 0.5, decay = 0.2 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + decay);
    src.connect(filt);
    this._env(filt, t, a, peak, decay);
    src.start(t, Math.random() * 0.5);
    src.stop(t + a + decay + 0.05);
  }

  _tone(t, { type = "sine", f0 = 440, f1 = f0, a = 0.005, peak = 0.3, decay = 0.2 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + decay);
    this._env(o, t, a, peak, decay);
    o.start(t);
    o.stop(t + a + decay + 0.05);
  }

  // ------------------------------------------------------------ 音效
  _swing(t) {
    this._noiseBurst(t, { f0: 700, f1: 3200, q: 2.2, a: 0.03, peak: 0.35, decay: 0.12 });
  }
  _thrust(t) {
    this._noiseBurst(t, { f0: 500, f1: 2200, q: 3, a: 0.02, peak: 0.32, decay: 0.1 });
  }
  _heavy(t) {
    this._noiseBurst(t, { f0: 300, f1: 1400, q: 1.6, a: 0.05, peak: 0.45, decay: 0.18 });
  }
  _slash(t) {
    this._noiseBurst(t, { type: "highpass", f0: 2500, f1: 1200, q: 0.7, peak: 0.42, decay: 0.09 });
    this._tone(t, { type: "triangle", f0: 2600, f1: 1800, peak: 0.08, decay: 0.12 });
    this._tone(t, { f0: 150, f1: 60, peak: 0.45, decay: 0.12 });
  }
  _stab(t) {
    this._noiseBurst(t, { type: "highpass", f0: 1800, f1: 900, peak: 0.35, decay: 0.07 });
    this._tone(t, { f0: 120, f1: 50, peak: 0.55, decay: 0.14 });
  }
  _sword(t) {
    this._tone(t, { type: "triangle", f0: 1900, f1: 1700, peak: 0.12, decay: 0.35 });
    this._tone(t, { type: "sine", f0: 2850, f1: 2700, peak: 0.07, decay: 0.3 });
    this._noiseBurst(t, { type: "highpass", f0: 3000, f1: 1500, peak: 0.3, decay: 0.08 });
    this._tone(t + 0.02, { f0: 110, f1: 45, peak: 0.4, decay: 0.16 });
  }
  _fire(t) {
    this._noiseBurst(t, { type: "lowpass", f0: 1600, f1: 300, q: 0.8, a: 0.01, peak: 0.55, decay: 0.32 });
    this._tone(t, { f0: 90, f1: 40, peak: 0.4, decay: 0.25 });
  }
  _boom(t) {
    this._noiseBurst(t, { type: "lowpass", f0: 900, f1: 80, q: 0.6, a: 0.008, peak: 0.8, decay: 0.7 });
    this._tone(t, { f0: 70, f1: 28, peak: 0.7, decay: 0.6 });
  }
  _thunder(t) {
    this._noiseBurst(t, { type: "highpass", f0: 4000, f1: 2000, peak: 0.5, decay: 0.06 });
    this._noiseBurst(t + 0.03, { type: "lowpass", f0: 600, f1: 90, peak: 0.6, decay: 0.55 });
  }
  _heal(t) {
    [1046, 1318, 1568, 2093].forEach((f, i) => this._tone(t + i * 0.06, { f0: f, peak: 0.09, decay: 0.45 }));
  }
  _cast(t) {
    this._tone(t, { type: "sine", f0: 420, f1: 980, a: 0.02, peak: 0.12, decay: 0.25 });
    this._noiseBurst(t, { f0: 2000, f1: 5000, q: 4, a: 0.03, peak: 0.12, decay: 0.2 });
  }
  _roar(t) {
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(70, t + 0.45);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600;
    o.connect(f);
    this._env(f, t, 0.04, 0.35, 0.45);
    o.start(t);
    o.stop(t + 0.55);
  }
  _rage(t) {
    this._noiseBurst(t, { f0: 200, f1: 3000, q: 1.2, a: 0.25, peak: 0.4, decay: 0.3 });
    this._tone(t + 0.2, { f0: 55, f1: 30, peak: 0.8, decay: 0.9 });
    [523, 784, 1046].forEach((f, i) => this._tone(t + 0.22 + i * 0.03, { type: "triangle", f0: f, peak: 0.1, decay: 0.9 }));
  }
  _crit(t) {
    this._tone(t, { type: "square", f0: 1400, f1: 900, peak: 0.06, decay: 0.12 });
  }
  _click(t) {
    this._tone(t, { type: "triangle", f0: 900, f1: 600, peak: 0.12, decay: 0.06 });
  }
  _start(t) {
    this._tone(t, { f0: 60, f1: 40, peak: 0.6, decay: 0.8 });
    [392, 523, 659].forEach((f, i) => this._tone(t + i * 0.09, { type: "triangle", f0: f, peak: 0.12, decay: 0.5 }));
  }
  _win(t) {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(t + i * 0.11, { type: "triangle", f0: f, peak: 0.16, decay: 0.6 }));
  }
  _lose(t) {
    [392, 349, 311, 262].forEach((f, i) => this._tone(t + i * 0.16, { type: "triangle", f0: f, peak: 0.14, decay: 0.6 }));
  }
}
