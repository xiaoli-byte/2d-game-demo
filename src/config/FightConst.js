// 战斗常量（对应原架构 FightConst）
export const FightConst = {
  STAGE_W: 720,
  STAGE_H: 1280,

  /** 动作帧率：DragonBones 动画按 30fps 导出，帧事件按 frame * FRAME_TIME 触发 */
  FRAME_RATE: 30,
  FRAME_TIME: 1000 / 30,
  /** 逻辑固定步长（ms） */
  LOGIC_STEP: 1000 / 60,

  /** 战斗限时（ms），超时判负 */
  FIGHT_TIME: 90000,
  /** 开场入场距离与时长 */
  ENTER_DISTANCE: 260,
  ENTER_TIME: 900,

  MAX_RAGE: 100,
  /** 冲刺移动速度 px/s */
  MOVE_SPEED: 1500,

  /** 角色基础缩放（原游戏 ENTITY_ARRAY_FIGHT_SCALE = .385，这里素材尺寸不同） */
  ENTITY_SCALE: 0.56,

  /** 大招前摇定格时长（shake1 帧事件触发 onWinupAction） */
  WINUP_TIME: 1100,
  /** 暴击顿帧 */
  HITSTOP_CRIT: 70,
  HITSTOP_HEAVY: 45,
};

/** 状态机编号与原游戏 EntityFSM 保持一致 */
export const State = {
  STAND: 1,
  MOVE: 2,
  BEHIT: 3,
  HITFLY: 4,
  ATTACK: 8,
  SKILL: 9,
  RAGE: 10,
  DIE: 11,
  WIN: 15,
};

export const StateName = {
  1: "站立",
  2: "移动",
  3: "受击",
  4: "击飞",
  8: "普攻",
  9: "技能",
  10: "大招",
  11: "死亡",
  15: "胜利",
};

/** 技能类型：与原游戏 runSkill(id, type) 一致，3 为大招 */
export const SkillType = { NORMAL: 1, SKILL: 2, RAGE: 3 };

/** 命中效果类型：对应 Conf.SkillHitEff 的 HitEffN = [类型, 参数] */
export const HitType = {
  INTERRUPT: 1,
  DAMAGE: 2,
  HITFLY: 3,
  HITBACK: 4,
  SHAKE: 5,
  HEAL: 8,
};

/** 战报动作类型（FightRecord 中 eActType） */
export const Act = {
  SKILL: 1,
  HP: 2,
  BUFF: 3,
  DEAD: 4,
  RAGE: 5,
  MOVE: 6,
  END: 9,
};

/** 伤害飘字类型 */
export const HpFlag = {
  NORMAL: 0,
  CRIT: 1,
  HEAL: 2,
  DOT: 3,
  DODGE: 4,
  SHIELD: 5,
};
