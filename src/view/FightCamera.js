// 战斗镜头（对应原游戏 FightCamera）
//  - shakeByType：按 ShakeInfo 表的分段振幅/角度/时长震屏，只会被更强的档位覆盖
//  - focus：大招前摇时推近镜头对准施法者
//  - punch：暴击时轻微的冲击缩放
import { ShakeInfo } from "../config/ShakeInfo.js";
import { Ease } from "../core/Ease.js";
import { FightConst } from "../config/FightConst.js";

export class FightCamera {
  constructor() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    this.focusX = FightConst.STAGE_W / 2;
    this.focusY = FightConst.STAGE_H * 0.7;
    this._shake = null;
    this._focus = null;
    this._punch = 0;
  }

  shakeByType(type) {
    const info = ShakeInfo[Math.max(0, Math.min(ShakeInfo.length - 1, type))];
    if (this._shake && this._shake.type > type) return;
    // 预生成每段的目标位移
    const segs = [];
    let total = 0;
    let i = 0;
    let sign = 1;
    while (total < info.playTime) {
      const n = i % info.amp.length;
      const decay = 1 - total / info.playTime;
      const a = (info.angle[n] * Math.PI) / 180;
      const amp = info.amp[n] * decay * sign;
      segs.push({ x: Math.cos(a) * amp, y: Math.sin(a) * amp, time: info.time[n % info.time.length], at: total });
      total += info.time[n % info.time.length];
      sign = -sign;
      i++;
    }
    segs.push({ x: 0, y: 0, time: 60, at: total });
    this._shake = { type, segs, t: 0, total: total + 60 };
  }

  /** 推近镜头：在 time 内保持 zoom，对准 (x, y) */
  focus(x, y, zoom, time) {
    this._focus = { x, y, zoom, time, t: 0 };
  }

  punch(v = 0.02) {
    this._punch = Math.max(this._punch, v);
  }

  update(dt) {
    // 震屏
    if (this._shake) {
      const s = this._shake;
      s.t += dt;
      let prev = { x: 0, y: 0 };
      let cur = s.segs[s.segs.length - 1];
      for (let i = 0; i < s.segs.length; i++) {
        const seg = s.segs[i];
        if (s.t < seg.at + seg.time) {
          cur = seg;
          prev = i > 0 ? s.segs[i - 1] : { x: 0, y: 0 };
          break;
        }
      }
      const k = Math.min(1, (s.t - cur.at) / cur.time);
      this.offsetX = prev.x + (cur.x - prev.x) * k;
      this.offsetY = prev.y + (cur.y - prev.y) * k;
      if (s.t >= s.total) {
        this._shake = null;
        this.offsetX = this.offsetY = 0;
      }
    }
    // 推镜：进 220ms，保持，出 300ms
    let zoom = 1;
    let fx = FightConst.STAGE_W / 2;
    let fy = FightConst.STAGE_H * 0.7;
    if (this._focus) {
      const f = this._focus;
      f.t += dt;
      const inT = 220;
      const outT = 300;
      let k;
      if (f.t < inT) k = Ease.cubicOut(f.t / inT);
      else if (f.t < f.time) k = 1;
      else k = 1 - Ease.sineInOut(Math.min(1, (f.t - f.time) / outT));
      zoom = 1 + (f.zoom - 1) * k;
      fx = fx + (f.x - fx) * k;
      fy = fy + (f.y - fy) * k;
      if (f.t >= f.time + outT) this._focus = null;
    }
    this._punch *= Math.pow(0.002, dt / 1000);
    this.zoom = zoom + this._punch;
    // 焦点限制：推镜后的可视范围不超出背景（背景比舞台多 8% 的边）
    const margin = FightConst.STAGE_W * 0.06;
    const halfW = FightConst.STAGE_W / 2 / this.zoom;
    this.focusX = Math.max(halfW - margin, Math.min(FightConst.STAGE_W - halfW + margin, fx));
    this.focusY = fy;
  }

  /** 应用到画布：以焦点为中心缩放 + 震屏位移 */
  apply(ctx) {
    const cx = FightConst.STAGE_W / 2;
    const cy = FightConst.STAGE_H * 0.7;
    ctx.translate(cx + this.offsetX, cy + this.offsetY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.focusX, -this.focusY);
  }
}
