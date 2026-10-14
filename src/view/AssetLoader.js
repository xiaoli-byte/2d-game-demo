// 素材加载与预处理
//  - 角色姿势图：计算"脚底中心"锚点，切换姿势时人物不会左右跳
//  - 剪影缓存：受击闪白、蓄力外发光、残影都用同一张图的着色剪影
//  - 色相偏移缓存：特效换色（tint）预先烘焙，避免每帧用 filter
import { HeroData } from "../config/HeroData.js";

const POSES = ["idle", "attack", "skill", "hit"];
const FX = ["fx_slash", "fx_fireball", "fx_foxfire", "fx_explosion", "fx_hit", "fx_lightning", "fx_heal", "fx_shield", "fx_sword", "fx_stun"];
const BG = ["bg_battle"];

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** 用底部若干行不透明像素的平均 x 作为脚底中心 */
function computeFootX(img) {
  const c = makeCanvas(img.width, img.height);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const rows = Math.max(6, Math.round(img.height * 0.07));
  const data = ctx.getImageData(0, img.height - rows, img.width, rows).data;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < img.width; x++) {
      if (data[(y * img.width + x) * 4 + 3] > 140) {
        sum += x;
        n++;
      }
    }
  }
  return n ? sum / n : img.width / 2;
}

export class Assets {
  constructor() {
    this.images = new Map();
    this.meta = new Map(); // 角色姿势图锚点
    this._silhouettes = new Map();
    this._tinted = new Map();
    this.portraits = new Map();
  }

  async load(onProgress) {
    const list = [];
    for (const conf of Object.values(HeroData)) {
      for (const p of conf.Poses || POSES) list.push(`${conf.Modle}_${p}`);
      list.push(`${conf.Modle}_portrait`);
    }
    list.push(...FX, ...BG);
    let done = 0;
    await Promise.all(
      list.map(async (name) => {
        const img = await loadImage(`assets/${name}.png`);
        if (img) this.images.set(name, img);
        done++;
        onProgress && onProgress(done / list.length);
      }),
    );
    for (const conf of Object.values(HeroData)) {
      for (const p of conf.Poses || POSES) {
        const img = this.images.get(`${conf.Modle}_${p}`);
        if (img) this.meta.set(img, { footX: computeFootX(img) });
      }
      this.portraits.set(conf.Modle, this.get(`${conf.Modle}_portrait`) || this._makePortrait(conf.Modle));
    }
  }

  get(name) {
    return this.images.get(name) || null;
  }

  /** 姿势图：缺失时退回 attack → idle */
  pose(model, pose) {
    return this.get(`${model}_${pose}`) || (pose === "skill" ? this.get(`${model}_attack`) : null) || this.get(`${model}_idle`);
  }

  footX(img) {
    const m = this.meta.get(img);
    return m ? m.footX : img.width / 2;
  }

  /**
   * 纯色剪影（可选模糊），用于闪白、外发光、残影。
   * 以半分辨率缓存（只用于发光叠加，看不出差别），绘制时按 k 放大，显存占用降为 1/4。
   */
  silhouette(img, color, blur = 0) {
    const key = img.src + "|" + color + "|" + blur;
    let c = this._silhouettes.get(key);
    if (c) return c;
    const k = 0.5;
    const pad = blur * 3 * k;
    c = makeCanvas(img.width * k + pad * 2, img.height * k + pad * 2);
    const ctx = c.getContext("2d");
    if (blur) ctx.filter = `blur(${blur * k}px)`;
    ctx.drawImage(img, pad, pad, img.width * k, img.height * k);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    c.pad = pad;
    c.k = k;
    this._silhouettes.set(key, c);
    return c;
  }

  /**
   * 特效换色：保留原图的明暗和透明度，整体改成指定颜色（color 混合模式）。
   * 数字参数仍按色相偏移处理（兼容旧配置）。
   */
  tinted(img, tint) {
    if (!tint) return img;
    const key = img.src + "|tint" + tint;
    let c = this._tinted.get(key);
    if (c) return c;
    c = makeCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    if (typeof tint === "number") {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.filter = `hue-rotate(${tint}deg) saturate(1.15)`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = "none";
    } else {
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(img, 0, 0);
    }
    this._tinted.set(key, c);
    return c;
  }

  /** 没有半身像素材时，从待机图顶部裁出头像（兜底） */
  _makePortrait(model) {
    const img = this.get(`${model}_idle`);
    if (!img) return null;
    const size = 220;
    const c = makeCanvas(size, size);
    const ctx = c.getContext("2d");
    // 头部大致在图片上方 0~32% 区域，取不透明像素的水平中心
    const probe = makeCanvas(img.width, img.height);
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    pctx.drawImage(img, 0, 0);
    const bandTop = Math.round(img.height * 0.04);
    const bandH = Math.round(img.height * 0.2);
    const data = pctx.getImageData(0, bandTop, img.width, bandH).data;
    let minX = img.width;
    let maxX = 0;
    let topY = bandH;
    for (let y = 0; y < bandH; y++) {
      for (let x = 0; x < img.width; x++) {
        if (data[(y * img.width + x) * 4 + 3] > 160) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < topY) topY = y;
        }
      }
    }
    const cx = maxX > minX ? (minX + maxX) / 2 : img.width / 2;
    const crop = img.height * 0.3;
    const sy = bandTop + topY - crop * 0.05;
    ctx.drawImage(img, cx - crop / 2, sy, crop, crop, 0, 0, size, size);
    return c;
  }
}
