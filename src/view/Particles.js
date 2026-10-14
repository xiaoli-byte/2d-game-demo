// 轻量粒子系统（火星、余烬、尘土、拖尾）
// 所有粒子都用叠加混合绘制，数量有上限，超出时回收最老的粒子
const MAX = 900;

// 每种颜色预渲染一张光点贴图，避免每个粒子每帧新建径向渐变
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  glowCache.set(color, c);
  return c;
}

export class Particles {
  constructor() {
    this.list = [];
  }

  emit(p) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      g: 0,
      drag: 0,
      life: 500,
      t: 0,
      size: 3,
      color: "#fff",
      kind: "dot", // dot | streak | puff
      add: true,
      layer: 0, // 0 前景 1 背景
      ...p,
    });
  }

  /** 火星迸溅：带拖尾的短线 */
  sparks(x, y, color, count, opt = {}) {
    for (let i = 0; i < count; i++) {
      const a = (opt.dir ?? 0) + (Math.random() - 0.5) * (opt.spread ?? Math.PI * 2);
      const s = 280 + Math.random() * 520;
      this.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, g: 1100, drag: 2.2, life: 220 + Math.random() * 260, size: 1.6 + Math.random() * 1.8, color, kind: "streak" });
    }
  }

  /** 余烬：缓慢飘散的光点 */
  embers(x, y, color, count, up = false) {
    for (let i = 0; i < count; i++) {
      this.emit({
        x: x + (Math.random() - 0.5) * 70,
        y: y + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 90,
        vy: up ? -60 - Math.random() * 120 : -30 - Math.random() * 90,
        g: up ? -20 : 40,
        drag: 0.8,
        life: 600 + Math.random() * 600,
        size: 2 + Math.random() * 2.6,
        color,
        kind: "dot",
      });
    }
  }

  /** 尘土：落地、冲刺时的烟尘 */
  dust(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.emit({
        x: x + (Math.random() - 0.5) * 40,
        y: y - Math.random() * 8,
        vx: dir * (40 + Math.random() * 160),
        vy: -20 - Math.random() * 50,
        g: 30,
        drag: 2.5,
        life: 500 + Math.random() * 400,
        size: 10 + Math.random() * 16,
        color,
        kind: "puff",
        add: false,
        layer: 1,
      });
    }
  }

  update(dt) {
    const s = dt / 1000;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.list.splice(i, 1);
        continue;
      }
      const d = Math.exp(-p.drag * s);
      p.vx *= d;
      p.vy = p.vy * d + p.g * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
  }

  draw(ctx, layer) {
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const k = 1 - p.t / p.life;
      ctx.globalCompositeOperation = p.add ? "lighter" : "source-over";
      if (p.kind === "streak") {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = Math.min(1, k * 1.4);
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.kind === "puff") {
        ctx.globalAlpha = 0.28 * k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = k;
        const r = p.size * (0.6 + k * 0.6) * 2.6;
        ctx.drawImage(glowSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
