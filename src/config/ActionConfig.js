// 动作配置（对应原游戏 DBConfig / dbSke_json）
//
// 原游戏里每个龙骨动作的"时长 + 帧事件表"是预先导出的数据，逻辑层 DBTimer 只读这份数据推进时间轴，
// 与动画是否真的渲染无关。这里同理：
//   frames  动作总帧数（30fps）
//   loop    是否循环
//   events  帧事件 [{ name, frame }]：hit1..N 命中段、shake1 大招前摇定格、eff1 额外特效
//   keys    表现层关键帧：pose 切换关键姿势图，x/y/rot/sx/sy 做位移旋转与挤压拉伸，glow 为蓄力光
//   smear   残影帧区间 [起, 止]
//
// 关键帧上的 ease 表示"从上一帧插值到这一帧"使用的缓动。

const k = (f, pose, props = {}) => ({ f, pose, x: 0, y: 0, rot: 0, sx: 1, sy: 1, glow: 0, ...props });

/** 所有角色通用的基础动作 */
const COMMON = {
  loading: {
    frames: 48,
    loop: true,
    keys: [k(0, "idle"), k(24, "idle", { y: -2, sx: 0.99, sy: 1.018, ease: "sineInOut" }), k(48, "idle", { ease: "sineInOut" })],
  },
  run: {
    frames: 14,
    loop: true,
    keys: [
      k(0, "idle", { rot: 7, sx: 1.03, sy: 0.97 }),
      k(4, "idle", { rot: 9, y: -12, sx: 0.98, sy: 1.03, ease: "sineOut" }),
      k(7, "idle", { rot: 7, sx: 1.03, sy: 0.97, ease: "sineIn" }),
      k(11, "idle", { rot: 9, y: -12, sx: 0.98, sy: 1.03, ease: "sineOut" }),
      k(14, "idle", { rot: 7, sx: 1.03, sy: 0.97, ease: "sineIn" }),
    ],
  },
  behit: {
    frames: 14,
    keys: [
      k(0, "hit", { x: -4, rot: -4, sx: 0.94, sy: 1.04 }),
      k(3, "hit", { x: -16, rot: -9, sx: 1.04, sy: 0.96, ease: "expoOut" }),
      k(9, "hit", { x: -8, rot: -5, ease: "sineOut" }),
      k(14, "idle", { ease: "sineInOut" }),
    ],
  },
  float_behit: {
    frames: 12,
    loop: true,
    keys: [k(0, "hit", { rot: -18 }), k(6, "hit", { rot: -26, ease: "sineInOut" }), k(12, "hit", { rot: -18, ease: "sineInOut" })],
  },
  up1: {
    frames: 14,
    keys: [k(0, "hit", { sx: 1.12, sy: 0.84, y: 6 }), k(6, "idle", { sx: 0.96, sy: 1.06, y: -6, ease: "backOut" }), k(14, "idle", { ease: "sineOut" })],
  },
  dead: {
    frames: 30,
    keys: [
      k(0, "hit", { x: -6, rot: -6 }),
      k(10, "hit", { x: -26, y: -18, rot: -22, ease: "sineOut" }),
      k(22, "hit", { x: -40, y: 0, rot: -78, sx: 1.04, sy: 0.92, ease: "quadIn" }),
      k(30, "hit", { x: -40, y: 0, rot: -82, ease: "sineOut" }),
    ],
  },
  win: {
    frames: 36,
    loop: true,
    keys: [k(0, "idle"), k(9, "idle", { y: -16, sx: 0.97, sy: 1.04, ease: "sineOut" }), k(18, "idle", { sx: 1.04, sy: 0.96, ease: "quadIn" }), k(36, "idle", { ease: "sineInOut" })],
  },
};

/** 近战挥砍型（剑仙、魔将、骷髅） */
const BLADE = {
  singleattack: {
    frames: 22,
    events: [{ name: "hit1", frame: 10 }],
    smear: [8, 13],
    keys: [
      k(0, "idle"),
      k(6, "idle", { x: -18, rot: -7, sx: 0.94, sy: 1.06, ease: "sineOut" }),
      k(9, "attack", { x: 30, rot: 4, sx: 1.1, sy: 0.93, ease: "expoOut" }),
      k(15, "attack", { x: 24, rot: 2, ease: "sineOut" }),
      k(22, "idle", { ease: "sineInOut" }),
    ],
  },
  attack: {
    frames: 40,
    events: [
      { name: "hit1", frame: 9 },
      { name: "hit2", frame: 19 },
      { name: "hit3", frame: 30 },
    ],
    smear: [7, 33],
    keys: [
      k(0, "idle"),
      k(5, "idle", { x: -14, rot: -6, sx: 0.95, sy: 1.05, ease: "sineOut" }),
      k(8, "attack", { x: 26, rot: 5, sx: 1.08, sy: 0.94, ease: "expoOut" }),
      k(14, "skill", { x: 10, y: -16, rot: -8, ease: "sineOut" }),
      k(18, "attack", { x: 34, rot: 6, sx: 1.1, sy: 0.92, ease: "expoOut" }),
      k(24, "skill", { x: 16, y: -30, rot: -12, glow: 0.6, ease: "sineOut" }),
      k(29, "attack", { x: 48, y: 0, rot: 8, sx: 1.14, sy: 0.88, glow: 1, ease: "expoOut" }),
      k(34, "attack", { x: 40, glow: 0.4, ease: "sineOut" }),
      k(40, "idle", { ease: "sineInOut" }),
    ],
  },
  bigskill: {
    frames: 56,
    events: [
      { name: "shake1", frame: 0 },
      { name: "hit1", frame: 20 },
      { name: "hit2", frame: 26 },
      { name: "hit3", frame: 32 },
      { name: "hit4", frame: 38 },
      { name: "hit5", frame: 44 },
    ],
    smear: [16, 46],
    keys: [
      k(0, "idle", { glow: 0.3 }),
      k(8, "skill", { y: -24, rot: -4, sx: 0.96, sy: 1.06, glow: 1, ease: "backOut" }),
      k(18, "skill", { y: -34, rot: -2, glow: 1, ease: "sineInOut" }),
      k(20, "attack", { x: 20, y: -10, rot: 6, sx: 1.08, sy: 0.94, glow: 1, ease: "expoOut" }),
      k(32, "skill", { x: 10, y: -30, rot: -6, glow: 1, ease: "sineInOut" }),
      k(44, "attack", { x: 28, y: 0, rot: 8, sx: 1.12, sy: 0.9, glow: 1, ease: "expoOut" }),
      k(50, "attack", { x: 22, glow: 0.4, ease: "sineOut" }),
      k(56, "idle", { ease: "sineInOut" }),
    ],
  },
};

/** 远程施法型（灵符师、妖狐）：hit 帧发射弹道，命中在弹道到达时结算 */
const CASTER = {
  singleattack: {
    frames: 24,
    events: [{ name: "hit1", frame: 12 }],
    keys: [
      k(0, "idle"),
      k(7, "skill", { x: -10, y: -8, rot: -5, sx: 0.96, sy: 1.04, glow: 0.5, ease: "sineOut" }),
      k(12, "attack", { x: 18, rot: 4, sx: 1.06, sy: 0.95, glow: 0.8, ease: "expoOut" }),
      k(17, "attack", { x: 14, glow: 0.2, ease: "sineOut" }),
      k(24, "idle", { ease: "sineInOut" }),
    ],
  },
  attack: {
    frames: 32,
    events: [{ name: "hit1", frame: 16 }],
    keys: [
      k(0, "idle"),
      k(10, "skill", { y: -20, sx: 0.97, sy: 1.05, glow: 1, ease: "backOut" }),
      k(16, "skill", { y: -26, glow: 1, ease: "sineInOut" }),
      k(24, "skill", { y: -16, glow: 0.5, ease: "sineInOut" }),
      k(32, "idle", { ease: "sineInOut" }),
    ],
  },
  bigskill: {
    frames: 60,
    events: [
      { name: "shake1", frame: 0 },
      { name: "hit1", frame: 22 },
      { name: "hit2", frame: 32 },
      { name: "hit3", frame: 42 },
    ],
    keys: [
      k(0, "idle", { glow: 0.3 }),
      k(10, "skill", { y: -40, sx: 0.95, sy: 1.07, glow: 1, ease: "backOut" }),
      k(22, "skill", { y: -50, glow: 1, ease: "sineInOut" }),
      k(32, "attack", { x: 10, y: -44, rot: 4, glow: 1, ease: "sineInOut" }),
      k(42, "skill", { y: -50, glow: 1, ease: "sineInOut" }),
      k(52, "skill", { y: -30, glow: 0.4, ease: "sineInOut" }),
      k(60, "idle", { ease: "sineInOut" }),
    ],
  },
};

/** 长枪突刺型（破军） */
const SPEAR = {
  singleattack: {
    frames: 22,
    events: [{ name: "hit1", frame: 11 }],
    smear: [9, 14],
    keys: [
      k(0, "idle"),
      k(7, "idle", { x: -24, rot: -3, sx: 0.93, sy: 1.05, ease: "sineOut" }),
      k(10, "attack", { x: 46, rot: 2, sx: 1.14, sy: 0.92, ease: "expoOut" }),
      k(16, "attack", { x: 38, ease: "sineOut" }),
      k(22, "idle", { ease: "sineInOut" }),
    ],
  },
  attack: {
    frames: 34,
    events: [{ name: "hit1", frame: 17 }],
    smear: [12, 22],
    keys: [
      k(0, "idle"),
      k(8, "skill", { x: -18, y: -10, rot: -14, glow: 0.8, ease: "sineOut" }),
      k(14, "skill", { x: -22, y: -12, rot: -18, glow: 1, ease: "sineInOut" }),
      k(17, "attack", { x: 40, rot: 10, sx: 1.12, sy: 0.9, glow: 1, ease: "expoOut" }),
      k(25, "attack", { x: 32, rot: 6, glow: 0.3, ease: "sineOut" }),
      k(34, "idle", { ease: "sineInOut" }),
    ],
  },
  bigskill: {
    frames: 54,
    events: [
      { name: "shake1", frame: 0 },
      { name: "hit1", frame: 24 },
      { name: "hit2", frame: 34 },
    ],
    smear: [16, 38],
    // 破阵冲锋：动作自带位移（root motion），冲过敌阵后返回
    keys: [
      k(0, "idle", { glow: 0.3 }),
      k(12, "skill", { x: -40, y: -6, rot: -10, sx: 0.92, sy: 1.08, glow: 1, ease: "sineOut" }),
      k(16, "skill", { x: -44, y: -6, rot: -12, glow: 1, ease: "sineInOut" }),
      k(24, "attack", { x: 300, rot: 6, sx: 1.16, sy: 0.9, glow: 1, ease: "expoOut" }),
      k(34, "attack", { x: 360, rot: 4, glow: 1, ease: "sineOut" }),
      k(44, "idle", { x: 120, rot: 0, glow: 0.3, ease: "sineInOut" }),
      k(54, "idle", { ease: "sineOut" }),
    ],
  },
};

const ARCHETYPE = { blade: BLADE, caster: CASTER, spear: SPEAR };

const cache = new Map();

/** 取某个模型的完整动作表 */
export function getActions(archetype) {
  if (!cache.has(archetype)) cache.set(archetype, { ...COMMON, ...ARCHETYPE[archetype] });
  return cache.get(archetype);
}

/** 统计动作中名字含 hit 的帧事件数（对应原游戏 getHitEventCnt） */
export function getHitEventCnt(action) {
  return (action.events || []).filter((e) => e.name.startsWith("hit")).length;
}
