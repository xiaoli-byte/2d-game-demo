// 伤害飘字（对应原游戏 FightFloatView.createHurtHPText）
// 动画曲线按原游戏参数复刻：
//   普通：scale 0.8 起，100ms 上移 15px，再 400ms 上移 23px 同时 scale→0.9，300ms 起淡出 300ms
//   暴击：scale 1.4 → 1.05 → 1.1 → 1 弹跳（100/200/100/100ms），420ms 起淡出 720ms
//   同一目标的多条飘字排队，间隔 100ms
import { HpFlag } from "../config/FightConst.js";
import { Ease } from "../core/Ease.js";

const NUM_FONT = '"ZCOOL QingKe HuangYou", "Microsoft YaHei", sans-serif';
const TXT_FONT = '"Ma Shan Zheng", "STKaiti", "KaiTi", serif';

const STYLE = {
  enemyHurt: { fill: ["#ffffff", "#ffe39a"], stroke: "#5a1d00", size: 46 },
  heroHurt: { fill: ["#ffb3a8", "#ff4a3a"], stroke: "#3a0000", size: 44 },
  crit: { fill: ["#fff6c0", "#ffb000", "#ff5a00"], stroke: "#4a0f00", size: 64 },
  heal: { fill: ["#e6ffe0", "#4dff7a"], stroke: "#003a12", size: 44 },
  dot: { fill: ["#ffd0a0", "#ff8a3a"], stroke: "#3a1600", size: 34 },
  text: { fill: ["#ffffff", "#d8e6ff"], stroke: "#0e1a3a", size: 40 },
  shield: { fill: ["#fff8d8", "#ffd25a"], stroke: "#3a2a00", size: 30 },
};

export class FightFloatView {
  constructor() {
    this.list = [];
    this.queue = new Map(); // 目标 id → 下一条可出现的时间
    this.now = 0;
  }

  clear() {
    this.list = [];
    this.queue.clear();
  }

  /** 来自 hp 事件 */
  onHp({ target, delta, flag, absorbed }) {
    if (flag === HpFlag.DODGE) return this.add(target, "闪避", "text", false);
    if (flag === HpFlag.HEAL) return this.add(target, "+" + delta, "heal", false);
    if (flag === HpFlag.DOT) this.add(target, String(-delta), "dot", false);
    else if (delta < 0) this.add(target, String(-delta), flag === HpFlag.CRIT ? "crit" : target.side === "enemy" ? "enemyHurt" : "heroHurt", flag === HpFlag.CRIT);
    if (absorbed > 0) this.add(target, "吸收 " + absorbed, "shield", false);
  }

  /** Buff 状态文字（眩晕、护盾...） */
  addText(target, text, color) {
    this.add(target, text, "text", false, color);
  }

  add(target, text, style, crit, color) {
    const start = Math.max(this.now, this.queue.get(target.id) || 0);
    this.queue.set(target.id, start + 100);
    this.list.push({
      target,
      text,
      style: STYLE[style],
      isText: style === "text" || style === "shield",
      crit,
      color,
      start,
      x: (Math.random() - 0.5) * 50,
      y: 0,
      life: crit ? 1140 : 620,
    });
  }

  update(dt) {
    this.now += dt;
    this.list = this.list.filter((f) => this.now - f.start < f.life);
  }

  draw(ctx) {
    for (const f of this.list) {
      const t = this.now - f.start;
      if (t < 0) continue;
      let scale;
      let rise;
      let alpha;
      if (f.crit) {
        if (t < 100) scale = 1.4 - 0.35 * (t / 100);
        else if (t < 300) scale = 1.05 + 0.05 * ((t - 100) / 200);
        else if (t < 400) scale = 1.1 - 0.1 * ((t - 300) / 100);
        else scale = 1;
        rise = 20 + 46 * Ease.sineOut(Math.min(1, t / 1100));
        alpha = t < 420 ? 1 : 1 - (t - 420) / 720;
      } else {
        if (t < 100) {
          scale = 0.8 + 0.25 * Ease.backOut(t / 100);
          rise = 15 * (t / 100);
        } else {
          scale = 1.05 - 0.15 * Math.min(1, (t - 100) / 400);
          rise = 15 + 23 * Ease.sineOut(Math.min(1, (t - 100) / 400));
        }
        alpha = t < 300 ? 1 : 1 - (t - 300) / 320;
      }
      const e = f.target;
      const x = e.drawX + f.x;
      const y = e.bodyY(1.02) - rise;
      const st = f.style;
      const size = st.size * scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(x, y);
      ctx.font = `${f.isText ? "" : "bold "}${Math.round(size)}px ${f.isText ? TXT_FONT : NUM_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      if (f.crit) {
        // "暴击"小标签
        ctx.save();
        ctx.font = `${Math.round(26 * scale)}px ${TXT_FONT}`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#3a0a00";
        ctx.fillStyle = "#ffdf6a";
        ctx.strokeText("暴击", -size * 0.5 - 10, -size * 0.55);
        ctx.fillText("暴击", -size * 0.5 - 10, -size * 0.55);
        ctx.restore();
      }
      const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
      const fills = f.color ? ["#ffffff", f.color] : st.fill;
      fills.forEach((c, i) => g.addColorStop(i / (fills.length - 1), c));
      ctx.lineWidth = Math.max(4, size * 0.16);
      ctx.strokeStyle = st.stroke;
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = g;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }
}
