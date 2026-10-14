// 特效管理（对应原游戏 EffectMgr.playEffetByJson / launchSkill）
//
// 特效 JSON 见 config/SkillData.js 顶部说明。zOrder 0 画在角色前面，1 画在角色后面（地面层）。
// obj 指定挂在施法者还是目标身上，特效会跟随挂点实体移动（击退、击飞时仍然贴着身体）。
import { Ease, clamp } from "../core/Ease.js";
import { Particles } from "./Particles.js";

const rad = (d) => (d * Math.PI) / 180;

class Effect {
  constructor(mgr, json, caster, target) {
    this.mgr = mgr;
    this.json = json;
    this.anchor = json.obj === 0 ? caster : target;
    this.caster = caster;
    this.t = -(json.delay || 0);
    this.time = json.time || 400;
    this.layer = json.zOrder === 1 ? 1 : 0;
    this.flipX = json.flip && caster.facing < 0 ? -1 : 1;
    this.seed = Math.random();
    this.dead = false;
    this.started = false;
    // 程序特效的随机形状预先生成
    if (json.proc === "crack") this.cracks = makeCracks(json.scale || 1);
  }

  get pos() {
    const a = this.anchor;
    const j = this.json;
    const x = a.drawX + (j.x || 0) * (a.facing || 1);
    const y = j.hy != null ? a.bodyY(j.hy) : a.y + a.liftY + (j.y || 0);
    return { x, y };
  }

  update(dt) {
    this.t += dt;
    if (this.t >= 0 && !this.started) {
      this.started = true;
      this.onStart();
    }
    if (this.json.proc === "aura" && this.t >= 0 && this.t < this.time) {
      this._auraAcc = (this._auraAcc || 0) + dt;
      while (this._auraAcc > 60) {
        this._auraAcc -= 60;
        const p = this.pos;
        this.mgr.particles.embers(p.x, p.y - 20, this.json.color, 1, true);
      }
    }
    if (this.t >= this.time) this.dead = true;
  }

  onStart() {
    const j = this.json;
    const p = this.pos;
    const n = j.count || 10;
    if (j.proc === "sparks") this.mgr.particles.sparks(p.x, p.y, j.color, n, { dir: this.caster.facing > 0 ? 0 : Math.PI, spread: Math.PI * 1.6 });
    else if (j.proc === "embers") this.mgr.particles.embers(p.x, p.y, j.color, n, !!j.up);
    else if (j.proc === "dust") this.mgr.particles.dust(p.x, this.anchor.y, j.color, n);
    else if (j.proc === "flash") this.mgr.flash(j.color, j.time || 120);
    if (j.proc === "sparks" || j.proc === "embers" || j.proc === "dust" || j.proc === "flash") this.dead = true;
  }

  draw(ctx) {
    if (this.t < 0 || this.dead) return;
    const j = this.json;
    const p = this.pos;
    const k = clamp(this.t / this.time, 0, 1);
    if (j.proc) return this.drawProc(ctx, p, k);

    let img = this.mgr.assets.get(j.res);
    if (!img) return;
    if (j.tint) img = this.mgr.assets.tinted(img, j.tint);
    const base = j.scale || 1;
    let sx = base;
    let sy = base;
    let rot = j.rot || 0;
    let alpha = 1;
    let dx = 0;
    let dy = 0;
    switch (j.anim) {
      case "sweep":
        sx = base * (0.55 + 0.6 * Ease.expoOut(Math.min(1, k * 2.2)));
        sy = base * (0.85 + 0.2 * Ease.expoOut(Math.min(1, k * 2.2)));
        rot += -26 + 40 * Ease.expoOut(Math.min(1, k * 1.8));
        alpha = k < 0.35 ? 1 : 1 - Ease.quadIn((k - 0.35) / 0.65);
        break;
      case "flicker":
        alpha = (0.55 + 0.45 * Math.abs(Math.sin(this.t * 0.09 + this.seed * 9))) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
        sx = base * (0.9 + 0.15 * Math.sin(this.t * 0.05));
        break;
      case "grow":
        sx = sy = base * (0.3 + 0.9 * Ease.cubicOut(k));
        alpha = 1 - Ease.quadIn(k);
        break;
      case "fall": {
        const fallK = Math.min(1, k / 0.42);
        dy = -460 * (1 - Ease.quadIn(fallK));
        alpha = k < 0.42 ? 0.4 + 0.6 * fallK : 1 - Ease.quadIn((k - 0.42) / 0.58);
        sy = base * (k < 0.42 ? 1.25 : 1);
        break;
      }
      case "rise":
        dy = -40 * Ease.sineOut(k);
        alpha = k < 0.2 ? k / 0.2 : 1 - Ease.quadIn((k - 0.2) / 0.8);
        break;
      case "spin":
        rot += 360 * Ease.cubicOut(k);
        sx = sy = base * (0.5 + 0.6 * Ease.backOut(Math.min(1, k * 2)));
        alpha = 1 - Ease.quadIn(k);
        break;
      case "pop":
      default:
        sx = sy = base * (0.55 + 0.5 * Ease.backOut(Math.min(1, k * 2.4)));
        alpha = k < 0.45 ? 1 : 1 - Ease.quadIn((k - 0.45) / 0.55);
        break;
    }
    ctx.save();
    ctx.globalCompositeOperation = j.blend === "add" ? "lighter" : "source-over";
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(p.x + dx, p.y + dy);
    ctx.rotate(rad(rot) * this.flipX);
    ctx.scale(sx * this.flipX, sy);
    if (j.anchor === "bottom") ctx.drawImage(img, -img.width / 2, -img.height);
    else ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  drawProc(ctx, p, k) {
    const j = this.json;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (j.proc === "ring") {
      const s = j.scale || 1;
      const r = (24 + 150 * Ease.cubicOut(k)) * s;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = j.color;
      ctx.lineWidth = (10 * (1 - k) + 1.5) * s;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.25;
      ctx.fillStyle = j.color;
      ctx.fill();
    } else if (j.proc === "aura") {
      const fade = k < 0.12 ? k / 0.12 : k > 0.82 ? (1 - k) / 0.18 : 1;
      const pulse = 0.85 + 0.15 * Math.sin(this.t * 0.012);
      const a = this.anchor;
      // 地面光圈
      ctx.globalAlpha = 0.75 * fade;
      const g = ctx.createRadialGradient(p.x, a.y, 0, p.x, a.y, 150 * pulse);
      g.addColorStop(0, j.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, a.y, 150 * pulse, 48 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      // 光柱
      const h = a.conf.Hight * 1.5;
      const lg = ctx.createLinearGradient(0, a.y, 0, a.y - h);
      lg.addColorStop(0, j.color);
      lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.35 * fade * pulse;
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(p.x, a.y - h / 2, 70, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (j.proc === "crack") {
      const fade = k < 0.08 ? k / 0.08 : 1 - Ease.quadIn(Math.max(0, (k - 0.3) / 0.7));
      const grow = Ease.expoOut(Math.min(1, k * 4));
      for (const c of this.cracks) {
        ctx.beginPath();
        const n = Math.max(2, Math.round(c.length * grow));
        ctx.moveTo(p.x, p.y);
        for (let i = 1; i < n; i++) ctx.lineTo(p.x + c[i][0], p.y + c[i][1]);
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = j.color;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = "#fff4d0";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function makeCracks(scale) {
  const out = [];
  const branches = 7;
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * Math.PI * 2 + Math.random() * 0.5;
    const pts = [[0, 0]];
    let x = 0;
    let y = 0;
    const len = (90 + Math.random() * 80) * scale;
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const d = (len / steps) * i;
      x = Math.cos(a) * d + (Math.random() - 0.5) * 18;
      y = (Math.sin(a) * d + (Math.random() - 0.5) * 10) * 0.36;
      pts.push([x, y]);
    }
    out.push(pts);
  }
  return out;
}

/** 弹道表现：沿逻辑弹道位置绘制，带光晕和拖尾 */
class BulletView {
  constructor(mgr, bullet) {
    this.mgr = mgr;
    this.b = bullet;
    this.acc = 0;
  }

  update(dt) {
    this.acc += dt;
    while (this.acc > 16) {
      this.acc -= 16;
      const c = this.b.conf.trail || "#ffb347";
      this.mgr.particles.emit({ x: this.b.x, y: this.b.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 260 + Math.random() * 160, size: 3 + Math.random() * 3, color: c, drag: 3 });
    }
  }

  draw(ctx) {
    const b = this.b;
    const img = this.mgr.assets.get(b.conf.res);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 46);
    g.addColorStop(0, b.conf.trail || "#ffb347");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (img) {
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      const s = b.conf.scale || 0.3;
      ctx.scale(s, s);
      // 弹道素材的光头在右侧，拖尾在左侧：把光头对准当前位置
      ctx.drawImage(img, -img.width * 0.78, -img.height / 2);
    }
    ctx.restore();
  }
}

export class EffectMgr {
  constructor(assets) {
    this.assets = assets;
    this.particles = new Particles();
    this.effects = [];
    this.bullets = new Map();
    this.flashState = null;
  }

  clear() {
    this.effects = [];
    this.bullets.clear();
    this.particles.list = [];
    this.flashState = null;
  }

  /** 按特效 JSON 列表播放（playEffetByJson） */
  playList(list, caster, target) {
    for (const json of list) this.effects.push(new Effect(this, json, caster, target));
  }

  flash(color, time) {
    this.flashState = { color, time, t: 0 };
  }

  onBullet(bullet, on) {
    if (on) this.bullets.set(bullet.id, new BulletView(this, bullet));
    else this.bullets.delete(bullet.id);
  }

  update(dt) {
    for (const e of this.effects) e.update(dt);
    this.effects = this.effects.filter((e) => !e.dead);
    for (const b of this.bullets.values()) b.update(dt);
    this.particles.update(dt);
    if (this.flashState) {
      this.flashState.t += dt;
      if (this.flashState.t >= this.flashState.time) this.flashState = null;
    }
  }

  drawLayer(ctx, layer) {
    this.particles.draw(ctx, layer);
    for (const e of this.effects) if (e.layer === layer) e.draw(ctx);
    if (layer === 0) for (const b of this.bullets.values()) b.draw(ctx);
  }
}
