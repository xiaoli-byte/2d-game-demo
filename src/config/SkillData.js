// 技能配置（对应原游戏 Conf.HeroSkillData + Conf.SkillHitEff + SkillConfig 表现 JSON）
//
// 逻辑字段
//   Type          1 普攻 / 2 小技能 / 3 大招
//   Action        播放的动作名（ActionConfig）
//   SkillTarget   目标规则：front 最近敌人 / frontArea 最近敌人及其周围 / all 全体敌人
//                 random 随机敌人 / lowestHpAlly 血量比例最低的友方 / self 自己
//   ReleaseScope  施放距离（px），超出则先冲刺接近；-1 表示原地施放
//   DamageType    1 物理 / 2 法术
//   NeedRage      大招所需怒气；AddRage 施放后获得怒气；RageBehit 受击方获得的怒气（按命中段均分）
//   CD            小技能冷却（ms）
//   HitEff        第 N 个元素对应帧事件 hitN，每段是 [类型, 参数] 列表（HitType）；段数不足时复用最后一段
//   Buffs         首段命中时附加（addSkillBuff）：{ id, to: target|self, chance, coef(按施法者攻击) }
//
// 表现字段（Show，对应原游戏 ShowConf 指向的表现 JSON）
//   attack[]  施法特效    hurt[]  受击特效（每段命中都播）
//   back      击退 { width, time }      fly  击飞 { width, height, time }
//   bullet    弹道 { res, speed, arc, scale, fromY, trail }：hit 帧发射，到达时结算命中
//   cutin     大招前摇演出的标题
//   sfx       { cast, hit } 音效
//
// 特效 JSON 字段（EffectMgr.playEffectByJson）
//   res 图片素材 / proc 程序特效(ring|sparks|embers|aura|crack|flash|dust)
//   obj 0 施法者 1 目标；zOrder 0 前景 1 背景；y 相对脚底（负数向上），hy 按身高比例偏移
//   scale rot time delay anim(pop|sweep|flicker|grow|fall|rise|spin) blend(add) tint(换成指定颜色)
import { HitType as H, SkillType } from "./FightConst.js";

const D = (coef) => [H.DAMAGE, coef];
const BACK = [H.HITBACK, 0];
const FLY = [H.HITFLY, 0];
const SHAKE = (t) => [H.SHAKE, t];
const HEAL = (coef) => [H.HEAL, coef];

const SLASH = (opt = {}) => ({ res: "fx_slash", obj: 1, hy: 0.52, scale: 0.36, rot: -12, anim: "sweep", time: 280, blend: "add", flip: true, ...opt });
const SPARK = (opt = {}) => ({ res: "fx_hit", obj: 1, hy: 0.5, scale: 0.28, anim: "pop", time: 220, blend: "add", ...opt });
const SPARKS = (color, count = 12, opt = {}) => ({ proc: "sparks", obj: 1, hy: 0.5, color, count, ...opt });
const RING = (color, opt = {}) => ({ proc: "ring", obj: 1, y: 0, color, time: 420, scale: 1, zOrder: 1, ...opt });
const BOOM = (opt = {}) => ({ res: "fx_explosion", obj: 1, hy: 0.42, scale: 0.32, anim: "pop", time: 420, blend: "add", ...opt });

export const HeroSkillData = {
  // ---------------- 剑仙·凌霄 ----------------
  1001: {
    Name: "流云剑",
    Type: SkillType.NORMAL,
    Action: "singleattack",
    SkillTarget: "front",
    ReleaseScope: 190,
    DamageType: 1,
    AddRage: 6,
    RageBehit: 3,
    HitEff: [[D(1.0), BACK]],
    Show: {
      hurt: [SLASH(), SPARK(), SPARKS("#c8fbff", 12)],
      back: { width: 22, time: 160 },
      sfx: { cast: "swing", hit: "slash" },
    },
  },
  1002: {
    Name: "三叠浪",
    Type: SkillType.SKILL,
    Action: "attack",
    SkillTarget: "front",
    ReleaseScope: 195,
    DamageType: 1,
    CD: 8000,
    AddRage: 6,
    RageBehit: 4,
    HitEff: [[D(0.75)], [D(0.75)], [D(1.15), BACK, SHAKE(1)]],
    Show: {
      hurt: [SLASH({ scale: 0.44, rot: -30 }), SPARK({ scale: 0.4 }), SPARKS("#c8fbff", 16)],
      back: { width: 46, time: 200 },
      sfx: { cast: "swing", hit: "slash" },
    },
  },
  1003: {
    Name: "万剑归宗",
    Type: SkillType.RAGE,
    Action: "bigskill",
    SkillTarget: "all",
    ReleaseScope: -1,
    DamageType: 1,
    NeedRage: 100,
    RageBehit: 5,
    HitEff: [[D(0.6)], [D(0.6)], [D(0.6)], [D(0.6)], [D(0.95), SHAKE(2)]],
    Show: {
      cutin: "万剑归宗",
      attack: [{ proc: "aura", obj: 0, color: "#7fe8ff", time: 1900, zOrder: 1 }],
      hurt: [
        { res: "fx_sword", obj: 1, hy: 0.5, scale: 0.42, anim: "fall", time: 260, blend: "add" },
        SPARK({ scale: 0.42, delay: 120 }),
        SPARKS("#c8fbff", 10, { delay: 120 }),
        RING("#7fe8ff", { delay: 120, scale: 0.8 }),
      ],
      sfx: { cast: "rage", hit: "sword" },
    },
  },

  // ---------------- 灵符师·紫萱 ----------------
  2001: {
    Name: "灵符弹",
    Type: SkillType.NORMAL,
    Action: "singleattack",
    SkillTarget: "front",
    ReleaseScope: -1,
    DamageType: 2,
    AddRage: 6,
    RageBehit: 3,
    HitEff: [[D(1.05)]],
    Show: {
      bullet: { res: "fx_fireball", speed: 1150, arc: 70, scale: 0.21, fromY: 0.62, trail: "#ffb347" },
      hurt: [BOOM(), SPARKS("#ffcf6a", 14), { proc: "embers", obj: 1, hy: 0.4, color: "#ff8a2a", count: 10 }],
      sfx: { cast: "cast", hit: "fire" },
    },
  },
  2002: {
    Name: "回春符",
    Type: SkillType.SKILL,
    Action: "attack",
    SkillTarget: "lowestHpAlly",
    ReleaseScope: -1,
    DamageType: 2,
    CD: 10000,
    AddRage: 6,
    HitEff: [[HEAL(1.9)]],
    Buffs: [{ id: "shield", to: "target", chance: 1, coef: 2.4 }],
    Show: {
      attack: [{ proc: "aura", obj: 0, color: "#b48cff", time: 900, zOrder: 1 }],
      hurt: [
        { res: "fx_heal", obj: 1, y: 0, anchor: "bottom", scale: 0.55, anim: "rise", time: 1000, blend: "add" },
        { proc: "embers", obj: 1, hy: 0.3, color: "#8dffb0", count: 16, up: true },
      ],
      sfx: { cast: "cast", hit: "heal" },
    },
  },
  2003: {
    Name: "九天雷劫",
    Type: SkillType.RAGE,
    Action: "bigskill",
    SkillTarget: "all",
    ReleaseScope: -1,
    DamageType: 2,
    NeedRage: 100,
    RageBehit: 5,
    HitEff: [[D(0.85), SHAKE(1)], [D(0.85), SHAKE(1)], [D(1.0), SHAKE(2)]],
    Buffs: [{ id: "stun", to: "target", chance: 0.45 }],
    Show: {
      cutin: "九天雷劫",
      attack: [{ proc: "aura", obj: 0, color: "#c99bff", time: 2000, zOrder: 1 }],
      hurt: [
        { res: "fx_lightning", obj: 1, y: 0, anchor: "bottom", scale: 0.75, anim: "flicker", time: 380, blend: "add" },
        { proc: "flash", color: "#e6d4ff", time: 120 },
        SPARKS("#e2c8ff", 14, { hy: 0.1 }),
        RING("#c99bff", { scale: 0.9 }),
      ],
      sfx: { cast: "rage", hit: "thunder" },
    },
  },

  // ---------------- 破军·赵烈 ----------------
  3001: {
    Name: "突刺",
    Type: SkillType.NORMAL,
    Action: "singleattack",
    SkillTarget: "front",
    ReleaseScope: 215,
    DamageType: 1,
    AddRage: 6,
    RageBehit: 3,
    HitEff: [[D(1.0), BACK]],
    Show: {
      hurt: [SPARK({ scale: 0.4 }), SPARKS("#ffc48a", 14), RING("#ffb070", { scale: 0.5, time: 300 })],
      back: { width: 32, time: 170 },
      sfx: { cast: "thrust", hit: "stab" },
    },
  },
  3002: {
    Name: "燎原横扫",
    Type: SkillType.SKILL,
    Action: "attack",
    SkillTarget: "frontArea",
    ReleaseScope: 215,
    DamageType: 1,
    CD: 9000,
    AddRage: 6,
    RageBehit: 4,
    HitEff: [[D(1.35), BACK, SHAKE(1)]],
    Buffs: [{ id: "burn", to: "target", chance: 1, coef: 0.32 }],
    Show: {
      hurt: [BOOM({ scale: 0.34 }), SLASH({ scale: 0.44, rot: 10, tint: "#ff7a2a" }), { proc: "embers", obj: 1, hy: 0.4, color: "#ff8a2a", count: 14 }],
      back: { width: 44, time: 200 },
      sfx: { cast: "thrust", hit: "fire" },
    },
  },
  3003: {
    Name: "破阵冲锋",
    Type: SkillType.RAGE,
    Action: "bigskill",
    SkillTarget: "all",
    ReleaseScope: -1,
    DamageType: 1,
    NeedRage: 100,
    RageBehit: 5,
    HitEff: [[D(1.45), FLY, SHAKE(3)], [D(0.9), SHAKE(1)]],
    Show: {
      cutin: "破阵冲锋",
      attack: [{ proc: "aura", obj: 0, color: "#ff9a4a", time: 1800, zOrder: 1 }, { proc: "dust", obj: 0, color: "#c9a27a", count: 18, delay: 700 }],
      hurt: [BOOM({ scale: 0.5 }), SPARK({ scale: 0.5 }), SPARKS("#ffc48a", 18), RING("#ffb070", { scale: 1.1 })],
      fly: { width: 70, height: 150, time: 720 },
      sfx: { cast: "rage", hit: "boom" },
    },
  },

  // ---------------- 赤炎魔将 ----------------
  4001: {
    Name: "魔刃",
    Type: SkillType.NORMAL,
    Action: "singleattack",
    SkillTarget: "front",
    ReleaseScope: 205,
    DamageType: 1,
    AddRage: 6,
    RageBehit: 3,
    HitEff: [[D(1.05), BACK]],
    Show: {
      hurt: [SLASH({ tint: "#ff3a22", scale: 0.36 }), SPARK({ tint: "#ff8a4a" }), SPARKS("#ff9a7a", 12)],
      back: { width: 26, time: 170 },
      sfx: { cast: "heavy", hit: "slash" },
    },
  },
  4002: {
    Name: "狂魔连斩",
    Type: SkillType.SKILL,
    Action: "attack",
    SkillTarget: "front",
    ReleaseScope: 205,
    DamageType: 1,
    CD: 9500,
    AddRage: 6,
    RageBehit: 4,
    HitEff: [[D(0.6)], [D(0.6)], [D(0.95), BACK, SHAKE(1)]],
    Buffs: [{ id: "rage", to: "self", chance: 1 }],
    Show: {
      attack: [{ proc: "aura", obj: 0, color: "#ff4a3a", time: 1100, zOrder: 1 }],
      hurt: [SLASH({ tint: "#ff3a22", scale: 0.38, rot: -28 }), SPARK({ tint: "#ff8a4a" }), SPARKS("#ff9a7a", 14)],
      back: { width: 40, time: 200 },
      sfx: { cast: "roar", hit: "slash" },
    },
  },
  4003: {
    Name: "裂地斩",
    Type: SkillType.RAGE,
    Action: "bigskill",
    SkillTarget: "all",
    ReleaseScope: -1,
    DamageType: 1,
    NeedRage: 100,
    RageBehit: 5,
    HitEff: [[D(0.48)], [D(0.48)], [D(0.48)], [D(0.48)], [D(0.8), SHAKE(3)]],
    Show: {
      cutin: "裂地斩",
      attack: [{ proc: "aura", obj: 0, color: "#ff4a3a", time: 1900, zOrder: 1 }],
      hurt: [BOOM({ scale: 0.36 }), { proc: "crack", obj: 1, color: "#ff6a3a", time: 900, zOrder: 1 }, SPARKS("#ff9a7a", 10)],
      sfx: { cast: "rage", hit: "boom" },
    },
  },

  // ---------------- 九尾妖狐 ----------------
  5001: {
    Name: "狐火",
    Type: SkillType.NORMAL,
    Action: "singleattack",
    SkillTarget: "random",
    ReleaseScope: -1,
    DamageType: 2,
    AddRage: 6,
    RageBehit: 3,
    HitEff: [[D(1.0)]],
    Show: {
      bullet: { res: "fx_foxfire", speed: 1050, arc: 90, scale: 0.21, fromY: 0.6, trail: "#6fd6ff" },
      hurt: [BOOM({ tint: "#4ac8ff", scale: 0.3 }), SPARKS("#a8ecff", 12)],
      sfx: { cast: "cast", hit: "fire" },
    },
  },
  5002: {
    Name: "狐火灼心",
    Type: SkillType.SKILL,
    Action: "attack",
    SkillTarget: "random",
    ReleaseScope: -1,
    DamageType: 2,
    CD: 9000,
    AddRage: 6,
    RageBehit: 4,
    HitEff: [[D(0.8)]],
    Buffs: [{ id: "foxburn", to: "target", chance: 1, coef: 0.36 }],
    Show: {
      attack: [{ proc: "aura", obj: 0, color: "#6fd6ff", time: 900, zOrder: 1 }],
      bullet: { res: "fx_foxfire", speed: 900, arc: 140, scale: 0.3, fromY: 0.62, trail: "#6fd6ff" },
      hurt: [BOOM({ tint: "#4ac8ff", scale: 0.36 }), { proc: "embers", obj: 1, hy: 0.4, color: "#6fd6ff", count: 14 }],
      sfx: { cast: "cast", hit: "fire" },
    },
  },
  5003: {
    Name: "九尾魅影",
    Type: SkillType.RAGE,
    Action: "bigskill",
    SkillTarget: "all",
    ReleaseScope: -1,
    DamageType: 2,
    NeedRage: 100,
    RageBehit: 5,
    HitEff: [[D(0.6)], [D(0.6)], [D(0.8), SHAKE(2)]],
    Buffs: [{ id: "charm", to: "target", chance: 0.5 }],
    Show: {
      cutin: "九尾魅影",
      attack: [{ proc: "aura", obj: 0, color: "#ff7ad9", time: 2000, zOrder: 1 }],
      hurt: [
        { res: "fx_foxfire", obj: 1, hy: 0.55, scale: 0.4, anim: "spin", time: 420, blend: "add" },
        BOOM({ tint: "#ff6ad0", scale: 0.32, delay: 80 }),
        SPARKS("#ffb0ec", 12),
      ],
      sfx: { cast: "rage", hit: "fire" },
    },
  },

  // ---------------- 幽冥骨卒 ----------------
  6001: {
    Name: "骨刃",
    Type: SkillType.NORMAL,
    Action: "singleattack",
    SkillTarget: "front",
    ReleaseScope: 190,
    DamageType: 1,
    AddRage: 6,
    RageBehit: 3,
    HitEff: [[D(1.0), BACK]],
    Show: {
      hurt: [SLASH({ tint: "#6dff9a", scale: 0.36 }), SPARK({ tint: "#b8ffc8" }), SPARKS("#c8ffd0", 10)],
      back: { width: 20, time: 150 },
      sfx: { cast: "swing", hit: "slash" },
    },
  },
  6002: {
    Name: "骨盾连斩",
    Type: SkillType.SKILL,
    Action: "attack",
    SkillTarget: "front",
    ReleaseScope: 190,
    DamageType: 1,
    CD: 10000,
    AddRage: 6,
    RageBehit: 4,
    HitEff: [[D(0.55)], [D(0.55)], [D(0.8), BACK]],
    Buffs: [{ id: "bone", to: "self", chance: 1, coef: 2.6 }],
    Show: {
      hurt: [SLASH({ tint: "#6dff9a", scale: 0.4, rot: -26 }), SPARK({ tint: "#b8ffc8" }), SPARKS("#c8ffd0", 12)],
      back: { width: 34, time: 190 },
      sfx: { cast: "swing", hit: "slash" },
    },
  },
  6003: {
    Name: "冥骨葬",
    Type: SkillType.RAGE,
    Action: "bigskill",
    SkillTarget: "front",
    ReleaseScope: -1,
    DamageType: 1,
    NeedRage: 100,
    RageBehit: 5,
    HitEff: [[D(0.65)], [D(0.65)], [D(0.65)], [D(0.65)], [D(1.1), SHAKE(2)]],
    Show: {
      cutin: "冥骨葬",
      attack: [{ proc: "aura", obj: 0, color: "#8cff9a", time: 1900, zOrder: 1 }],
      hurt: [
        { res: "fx_sword", obj: 1, hy: 0.5, scale: 0.4, anim: "fall", time: 260, blend: "add", tint: "#7dff9a" },
        SPARK({ tint: "#b8ffc8", delay: 120 }),
        RING("#8cff9a", { delay: 120, scale: 0.8 }),
      ],
      sfx: { cast: "rage", hit: "sword" },
    },
  },
};
