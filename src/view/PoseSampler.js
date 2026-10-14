// 关键帧采样：给定动作与当前帧，插值出姿势图与变换（对应龙骨动画的显示部分）
// 姿势图按"上一关键帧"切换（阶跃），位移/旋转/缩放/蓄力光按下一关键帧的缓动插值。
import { Ease } from "../core/Ease.js";

const DEFAULT = { pose: "idle", x: 0, y: 0, rot: 0, sx: 1, sy: 1, glow: 0 };

export function samplePose(action, frame) {
  if (!action || !action.keys || !action.keys.length) return DEFAULT;
  const keys = action.keys;
  if (frame <= keys[0].f) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (frame <= b.f) {
      const a = keys[i - 1];
      const span = b.f - a.f || 1;
      const t = (Ease[b.ease] || Ease.linear)((frame - a.f) / span);
      return {
        // 姿势图在到达下一关键帧前 1 帧切换，命中瞬间画面已经是出招姿势
        pose: frame >= b.f - 1 ? b.pose : a.pose,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        rot: a.rot + (b.rot - a.rot) * t,
        sx: a.sx + (b.sx - a.sx) * t,
        sy: a.sy + (b.sy - a.sy) * t,
        glow: a.glow + (b.glow - a.glow) * t,
      };
    }
  }
  return keys[keys.length - 1];
}

export function inSmear(action, frame) {
  return !!(action && action.smear && frame >= action.smear[0] && frame <= action.smear[1]);
}
