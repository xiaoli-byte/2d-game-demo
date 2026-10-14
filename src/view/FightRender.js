// 战斗渲染（对应原游戏 FightView 的显示部分 + BodyComponent / HeadComponent 的表现）
//
// 绘制顺序：背景 → 地面特效(zOrder 1) → 阵营光圈/影子 → 角色(按 y 排序) → 前景特效(zOrder 0)
//          → 头顶血条 → 飘字 → 全屏闪光 → 暗角
// 大招前摇期间：全场压暗，施法者单独提亮绘制在暗层之上。
import { FightConst, HpFlag } from "../config/FightConst.js";
import { clamp } from "../core/Ease.js";
import { samplePose, inSmear } from "./PoseSampler.js";
import { EffectMgr } from "./EffectMgr.js";
import { FightFloatView } from "./FightFloatView.js";
import { FightCamera } from "./FightCamera.js";

const W = FightConst.STAGE_W;
const H = FightConst.STAGE_H;
const TEAM_COLOR = { hero: "#58d2ff", enemy: "#ff5a4a" };

export class FightRender {
  constructor(canvas, assets, sound) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.sound = sound;
    this.effects = new EffectMgr(assets);
    this.floats = new FightFloatView();
    this.camera = new FightCamera();
    this.world = null;
    this.vs = new Map(); // 实体 id → 表现状态
    this.winup = null;
    this.showDebug = false;
    this.time = 0;
    this._ambientAcc = 0;
    this._unsub = [];
    this._vignette = null;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round((rect.width || W) * dpr));
    const h = Math.max(1, Math.round((rect.height || H) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // fixedWidth 适配（与原游戏 scaleMode 一致）：宽度固定 720，高度随屏幕比例变化，
    // 多出来的高度上下均分，战场保持在画面中部
    this.scale = w / W;
    this.viewH = h / this.scale;
    this.offsetY = (this.viewH - H) / 2;
  }

  // ------------------------------------------------------------ 绑定战斗
  attach(world) {
    this.detach();
    this.world = world;
    this.vs.clear();
    this.effects.clear();
    this.floats.clear();
    this.winup = null;
    for (const e of world.entities) this.vs.set(e.id, { flash: 0, trail: [], trailAcc: 0, alpha: 1, lagHp: e.hp, lagHold: 0, dissolved: false, dotAcc: 0, rageFull: false });
    const bus = world.bus;
    this._unsub = [
      bus.on("fx", (d) => this.effects.playList(d.list, d.caster, d.target)),
      bus.on("bullet", (d) => this.effects.onBullet(d.bullet, d.on)),
      bus.on("hp", (d) => this.onHp(d)),
      bus.on("shake", (d) => this.camera.shakeByType(d.type)),
      bus.on("winup", (d) => this.onWinup(d)),
      bus.on("sfx", (d) => this.sound.play(d.id)),
      bus.on("land", (d) => {
        this.effects.particles.dust(d.entity.drawX, d.entity.y, "#b89a7a", 10);
        this.camera.shakeByType(0);
      }),
      bus.on("buff", (d) => {
        if (d.on) this.floats.addText(d.entity, d.buff.conf.Name, d.buff.conf.Color);
      }),
    ];
  }

  detach() {
    this._unsub.forEach((u) => u());
    this._unsub = [];
    this.world = null;
  }

  onHp({ target, delta, flag, absorbed }) {
    this.floats.onHp({ target, delta, flag, absorbed });
    const vs = this.vs.get(target.id);
    if (!vs) return;
    if (delta < 0) {
      vs.flash = flag === HpFlag.DOT ? 0.45 : 1;
      vs.lagHold = 380;
    }
    if (flag === HpFlag.CRIT) {
      this.camera.punch(0.025);
      this.sound.play("crit");
    }
  }

  onWinup({ caster, conf, time }) {
    this.winup = { caster, conf, t: 0, time };
    this.camera.focus(caster.drawX, caster.bodyY(0.55), 1.14, time);
  }

  // ------------------------------------------------------------ 每帧
  update(dt) {
    this.time += dt;
    this.camera.update(dt);
    this.effects.update(dt);
    this.floats.update(dt);
    if (this.winup) {
      this.winup.t += dt;
      if (this.winup.t > this.winup.time + 260) this.winup = null;
    }
    // 背景氛围粒子
    this._ambientAcc += dt;
    while (this._ambientAcc > 140) {
      this._ambientAcc -= 140;
      this.effects.particles.emit({
        x: Math.random() * W,
        y: H * (0.45 + Math.random() * 0.5),
        vx: 8 + Math.random() * 18,
        vy: -12 - Math.random() * 20,
        life: 3000 + Math.random() * 2500,
        size: 1.2 + Math.random() * 1.8,
        color: Math.random() < 0.5 ? "#ffcf8a" : "#ff9a5a",
        drag: 0,
        layer: 1,
      });
    }
    if (!this.world) return;
    for (const e of this.world.entities) this.updateEntityView(e, dt);
  }

  updateEntityView(e, dt) {
    const vs = this.vs.get(e.id);
    vs.flash = Math.max(0, vs.flash - dt / 140);
    // 延迟掉血条
    if (vs.lagHold > 0) vs.lagHold -= dt;
    else vs.lagHp += (e.hp - vs.lagHp) * Math.min(1, dt / 140);
    if (e.hp > vs.lagHp) vs.lagHp = e.hp;
    // 残影采样
    const action = e.timer.action;
    for (const s of vs.trail) s.t += dt;
    vs.trail = vs.trail.filter((s) => s.t < 170);
    if (inSmear(action, e.timer.frame) && this.world && this.world.freezeLeft <= 0) {
      vs.trailAcc += dt;
      if (vs.trailAcc > 30) {
        vs.trailAcc = 0;
        vs.trail.push({ ...this.entityTransform(e), t: 0 });
      }
    }
    // 死亡溶解
    if (e.deathDone && !vs.dissolved) {
      vs.dissolved = true;
      this.effects.particles.embers(e.drawX, e.bodyY(0.3), e.conf.Color, 26, true);
    }
    if (vs.dissolved) vs.alpha = Math.max(0, vs.alpha - dt / 700);
    // 持续伤害：身上冒火星
    const dot = e.buff.list.find((b) => b.conf.Type === "dot");
    if (dot && e.hp > 0) {
      vs.dotAcc += dt;
      if (vs.dotAcc > 160) {
        vs.dotAcc = 0;
        this.effects.particles.embers(e.drawX, e.bodyY(0.4), dot.conf.Color, 1, true);
      }
    }
  }

  entityTransform(e) {
    const action = e.timer.action;
    const p = samplePose(action, e.timer.frame);
    const model = e.conf.Modle;
    const img = this.assets.pose(model, p.pose);
    const idle = this.assets.pose(model, "idle");
    const scale = idle ? e.conf.Hight / idle.height : 1;
    const f = e.facing;
    return { img, x: e.drawX + p.x * f, y: e.y + e.liftY + p.y, rot: (p.rot * Math.PI * f) / 180, sx: p.sx * scale * f, sy: p.sy * scale, glow: p.glow };
  }

  // ------------------------------------------------------------ 绘制
  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const base = () => ctx.setTransform(this.scale, 0, 0, this.scale, 0, this.offsetY * this.scale);
    base();

    ctx.save();
    this.camera.apply(ctx);
    this.drawBackground(ctx);
    this.effects.drawLayer(ctx, 1);

    if (this.world) {
      const list = this.world.entities.slice().sort((a, b) => a.y - b.y);
      for (const e of list) this.drawGround(ctx, e);
      const caster = this.winup ? this.winup.caster : null;
      for (const e of list) if (e !== caster) this.drawEntity(ctx, e);
      if (this.winup) {
        // 大招前摇：其他特效一起压暗，只有施法者在暗层之上
        this.effects.drawLayer(ctx, 0);
        ctx.save();
        base();
        ctx.fillStyle = `rgba(4,6,14,${0.66 * this.winupAlpha()})`;
        ctx.fillRect(0, -this.offsetY, W, this.viewH);
        ctx.restore();
        this.drawEntity(ctx, caster);
      } else {
        this.effects.drawLayer(ctx, 0);
      }
      if (!this.winup) for (const e of list) this.drawHead(ctx, e);
      this.floats.draw(ctx);
      if (this.showDebug) this.drawDebug(ctx, list);
    }
    ctx.restore();

    // 屏幕空间：闪光与暗角
    const fl = this.effects.flashState;
    if (fl) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * (1 - fl.t / fl.time);
      ctx.fillStyle = fl.color;
      ctx.fillRect(0, -this.offsetY, W, this.viewH);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(this.vignette(), 0, -this.offsetY, W, this.viewH);
  }

  winupAlpha() {
    const w = this.winup;
    if (!w) return 0;
    if (w.t < 160) return w.t / 160;
    if (w.t > w.time) return Math.max(0, 1 - (w.t - w.time) / 260);
    return 1;
  }

  drawBackground(ctx) {
    const bg = this.assets.get("bg_battle");
    // 多画出 8% 的边，震屏和推镜时不露底
    const m = 0.08;
    const viewH = Math.max(H, this.viewH || H);
    if (bg) {
      const s = Math.max((W * (1 + m * 2)) / bg.width, (viewH * (1 + m * 2)) / bg.height);
      const w = bg.width * s;
      const h = bg.height * s;
      ctx.drawImage(bg, (W - w) / 2, (H - h) / 2 + H * 0.02, w, h);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#2a1d3a");
      g.addColorStop(0.45, "#6b3a3a");
      g.addColorStop(1, "#2a2420");
      ctx.fillStyle = g;
      ctx.fillRect(-W * m, -viewH * m, W * (1 + m * 2), viewH * (1 + m * 2));
    }
    // 战场区域压一层暖色地面光，让角色更突出
    const g2 = ctx.createRadialGradient(W / 2, H * 0.74, 40, W / 2, H * 0.74, W * 0.75);
    g2.addColorStop(0, "rgba(255,190,120,0.12)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(-W * m, -H * m, W * (1 + m * 2), H * (1 + m * 2));
  }

  drawGround(ctx, e) {
    const vs = this.vs.get(e.id);
    if (vs.alpha <= 0) return;
    const lift = clamp(-e.liftY / 160, 0, 1);
    const x = e.drawX;
    const y = e.y;
    ctx.save();
    ctx.globalAlpha = vs.alpha;
    // 影子
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(x, y, 64 * (1 - lift * 0.4), 18 * (1 - lift * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
    // 阵营光圈
    if (e.hp > 0) {
      const c = TEAM_COLOR[e.side];
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * vs.alpha;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 58, 17, 0, 0, Math.PI * 2);
      ctx.stroke();
      const g = ctx.createRadialGradient(x, y, 0, x, y, 58);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, c);
      ctx.globalAlpha = 0.16 * vs.alpha;
      ctx.fillStyle = g;
      ctx.fill();
      // 狂怒：脚下红色光环
      if (e.buff.list.some((b) => b.conf.Type === "atkUp")) {
        ctx.globalAlpha = 0.45 + 0.25 * Math.sin(this.time * 0.01);
        ctx.strokeStyle = "#ff3a2a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(x, y, 72, 22, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawSprite(ctx, img, t, alpha, op = "source-over", sil = null) {
    const footX = this.assets.footX(img);
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rot);
    ctx.scale(t.sx, t.sy);
    if (sil) ctx.drawImage(sil, -footX - sil.pad / sil.k, -img.height - sil.pad / sil.k, sil.width / sil.k, sil.height / sil.k);
    else ctx.drawImage(img, -footX, -img.height);
    ctx.restore();
  }

  drawEntity(ctx, e) {
    const vs = this.vs.get(e.id);
    if (vs.alpha <= 0) return;
    const t = this.entityTransform(e);
    if (!t.img) return this.drawPlaceholder(ctx, e, t);
    const color = e.conf.Color;
    // 残影
    for (const s of vs.trail) {
      if (!s.img) continue;
      const k = 1 - s.t / 170;
      this.drawSprite(ctx, s.img, s, 0.24 * k * vs.alpha, "lighter", this.assets.silhouette(s.img, color, 0));
    }
    // 蓄力外发光
    if (t.glow > 0.01) {
      const pulse = 0.8 + 0.2 * Math.sin(this.time * 0.02);
      this.drawSprite(ctx, t.img, t, t.glow * 0.42 * pulse * vs.alpha, "lighter", this.assets.silhouette(t.img, color, 9));
    }
    // 死亡时变灰
    if (e.hp <= 0) ctx.filter = "grayscale(0.7) brightness(0.8)";
    this.drawSprite(ctx, t.img, t, vs.alpha);
    ctx.filter = "none";
    // 受击闪白
    if (vs.flash > 0) this.drawSprite(ctx, t.img, t, vs.flash * 0.55 * vs.alpha, "lighter", this.assets.silhouette(t.img, "#ffffff", 0));
    // 护盾、被控等 Buff 表现
    if (e.hp > 0) this.drawBuffVisuals(ctx, e, t);
  }

  drawBuffVisuals(ctx, e, t) {
    const shield = e.buff.list.find((b) => b.conf.Type === "shield");
    if (shield) {
      const img = this.assets.get("fx_shield");
      const size = e.conf.Hight * 1.2;
      const a = 0.4 + 0.12 * Math.sin(this.time * 0.006);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      if (img) {
        const s = size / Math.max(img.width, img.height);
        ctx.drawImage(img, e.drawX - (img.width * s) / 2, e.bodyY(0.48) - (img.height * s) / 2, img.width * s, img.height * s);
      } else {
        ctx.strokeStyle = shield.conf.Color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(e.drawX, e.bodyY(0.48), size * 0.4, size * 0.52, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    const ctrl = e.buff.list.find((b) => b.conf.Control);
    if (ctrl) {
      const img = this.assets.get("fx_stun");
      const y = e.bodyY(1.02) - 6;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (img) {
        const tinted = ctrl.id === "charm" ? this.assets.tinted(img, 290) : img;
        const w = 120;
        const s = w / tinted.width;
        ctx.translate(e.drawX, y);
        ctx.scale(1, 0.9 + 0.1 * Math.sin(this.time * 0.01));
        ctx.globalAlpha = 0.95;
        ctx.drawImage(tinted, -w / 2, (-tinted.height * s) / 2, w, tinted.height * s);
      } else {
        for (let i = 0; i < 3; i++) {
          const a = this.time * 0.006 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = ctrl.conf.Color;
          ctx.beginPath();
          ctx.arc(e.drawX + Math.cos(a) * 34, y + Math.sin(a) * 10, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawPlaceholder(ctx, e, t) {
    // 素材缺失时的占位：用阵营色画一个剪影
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rot);
    ctx.fillStyle = e.conf.Color;
    ctx.globalAlpha = this.vs.get(e.id).alpha * 0.85;
    const h = e.conf.Hight;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.82, h * 0.1, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-h * 0.12, -h * 0.7, h * 0.24, h * 0.4);
    ctx.fillRect(-h * 0.1, -h * 0.3, h * 0.08, h * 0.3);
    ctx.fillRect(h * 0.02, -h * 0.3, h * 0.08, h * 0.3);
    ctx.restore();
  }

  /** 头顶血条（HeadComponent） */
  drawHead(ctx, e) {
    const vs = this.vs.get(e.id);
    if (e.hp <= 0 && vs.lagHp <= 1) return;
    const w = 112;
    const x = e.drawX - w / 2;
    const y = e.bodyY(1.0) - 14;
    const maxHp = e.attr.maxHp;
    const hpK = clamp(e.hp / maxHp, 0, 1);
    const lagK = clamp(vs.lagHp / maxHp, 0, 1);
    const shield = e.buff.shieldValue();
    const shieldK = clamp(shield / maxHp, 0, 1 - hpK);

    ctx.save();
    // 名字
    ctx.font = '600 19px "Ma Shan Zheng", "STKaiti", "KaiTi", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(e.name, e.drawX, y - 3);
    ctx.fillStyle = e.side === "hero" ? "#e9f6ff" : "#ffd9d2";
    ctx.fillText(e.name, e.drawX, y - 3);

    // 血条底
    roundRect(ctx, x - 2, y - 2, w + 4, 17, 5);
    ctx.fillStyle = "rgba(10,10,16,0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,226,160,0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 延迟条
    ctx.fillStyle = "#f4f0e6";
    ctx.fillRect(x, y, w * lagK, 9);
    // 血量
    const g = ctx.createLinearGradient(0, y, 0, y + 9);
    if (e.side === "hero") {
      g.addColorStop(0, "#8dffb0");
      g.addColorStop(1, "#19a64a");
    } else {
      g.addColorStop(0, "#ff8a7a");
      g.addColorStop(1, "#c4180e");
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * hpK, 9);
    // 护盾
    if (shieldK > 0) {
      ctx.fillStyle = "rgba(255,214,110,0.9)";
      ctx.fillRect(x + w * hpK, y, w * shieldK, 9);
    }
    // 刻度
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let i = 1; i < 5; i++) ctx.fillRect(x + (w * i) / 5, y, 1, 9);
    // 怒气
    const rageK = e.rage / FightConst.MAX_RAGE;
    const full = rageK >= 1;
    const rg = ctx.createLinearGradient(x, 0, x + w, 0);
    if (full) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 0.012);
      rg.addColorStop(0, "#ffd36a");
      rg.addColorStop(1, `rgba(255,${200 + 55 * p},${120 + 100 * p},1)`);
    } else {
      rg.addColorStop(0, "#3a8bff");
      rg.addColorStop(1, "#7fe0ff");
    }
    ctx.fillStyle = rg;
    ctx.fillRect(x, y + 11, w * rageK, 3);
    // Buff 图标
    let bx = x + w + 6;
    for (const b of e.buff.list) {
      roundRect(ctx, bx, y - 3, 18, 18, 4);
      ctx.fillStyle = b.conf.Color;
      ctx.fill();
      ctx.font = '13px "Ma Shan Zheng", "KaiTi", serif';
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#1a1010";
      ctx.fillText(b.conf.Icon, bx + 9, y + 6.5);
      bx += 20;
    }
    ctx.restore();
  }

  drawDebug(ctx, list) {
    ctx.save();
    ctx.font = "15px Consolas, monospace";
    ctx.textAlign = "center";
    for (const e of list) {
      const vs = this.vs.get(e.id);
      if (vs.alpha <= 0) continue;
      // 脚底锚点与身高
      ctx.strokeStyle = "rgba(0,255,180,0.8)";
      ctx.beginPath();
      ctx.moveTo(e.drawX - 10, e.y);
      ctx.lineTo(e.drawX + 10, e.y);
      ctx.moveTo(e.drawX, e.y);
      ctx.lineTo(e.drawX, e.bodyY(1));
      ctx.stroke();
      // 当前动作与帧
      const a = e.timer;
      const label = `${a.name} ${Math.floor(a.frame)}/${a.action ? a.action.frames : 0}`;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(e.drawX - 70, e.y + 8, 140, 40);
      ctx.fillStyle = "#7fffd4";
      ctx.fillText(label, e.drawX, e.y + 24);
      // 帧事件时间轴
      if (a.action) {
        const tw = 130;
        const tx = e.drawX - tw / 2;
        const ty = e.y + 36;
        ctx.fillStyle = "#334";
        ctx.fillRect(tx, ty, tw, 6);
        ctx.fillStyle = "#7fffd4";
        ctx.fillRect(tx, ty, (tw * a.frame) / a.action.frames, 6);
        for (const ev of a.action.events || []) {
          ctx.fillStyle = ev.name === "shake1" ? "#ffcc33" : "#ff4a6a";
          ctx.fillRect(tx + (tw * ev.frame) / a.action.frames - 1, ty - 3, 3, 12);
        }
      }
    }
    ctx.restore();
  }

  vignette() {
    if (this._vignette) return this._vignette;
    const c = document.createElement("canvas");
    c.width = W / 2;
    c.height = H / 2;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.55, c.width * 0.35, c.width / 2, c.height * 0.55, c.height * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    this._vignette = c;
    return c;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

