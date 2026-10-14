// AI（对应原游戏 AIComponent.exeLogic / selectSkill）
// 每帧检查：站立且未被控时，按 大招(怒气满) > 小技能(CD 好) > 普攻(攻击间隔到) 的顺序选技能。
// 怪物和开启自动的英雄会自动放大招；关闭自动时，英雄大招由玩家点卡牌触发。
import { State } from "../../config/FightConst.js";
import { HeroSkillData } from "../../config/SkillData.js";
import { selectTargets } from "../TargetSelector.js";

export class AIComponent {
  constructor(entity) {
    this.entity = entity;
    const w = entity.world;
    const cd = HeroSkillData[entity.conf.Skills.skill].CD;
    // 错开首次技能和首次普攻时间，避免所有人同一帧出手
    this.skillReadyAt = cd * w.rng.range(0.35, 0.7);
    this.nextAttackAt = w.rng.range(0, 500);
    this.rageRequested = false;
  }

  canRage() {
    const e = this.entity;
    const conf = HeroSkillData[e.conf.Skills.rage];
    return e.rage >= conf.NeedRage;
  }

  requestRage() {
    if (this.canRage()) this.rageRequested = true;
  }

  tick() {
    const e = this.entity;
    const w = e.world;
    if (!w.isLive || !w.fighting || e.hp <= 0 || e.busy) return;
    if (e.fsm.state !== State.STAND) return;
    if (e.buff.isUnable()) return;

    const skills = e.conf.Skills;
    const auto = e.side === "enemy" || w.autoRage;
    if (this.canRage() && (auto || this.rageRequested)) {
      this.rageRequested = false;
      if (this.cast(skills.rage)) return;
    }
    if (w.time >= this.skillReadyAt && this.cast(skills.skill)) return;
    if (w.time >= this.nextAttackAt) {
      if (this.cast(skills.normal)) this.nextAttackAt = w.time + e.attr.interval * w.rng.range(0.92, 1.08);
    }
  }

  cast(skillId) {
    const e = this.entity;
    const conf = HeroSkillData[skillId];
    const targets = selectTargets(e.world, e, conf.SkillTarget);
    if (!targets.length) return false;
    // 治疗技能：没人掉血就先不放
    if (conf.SkillTarget === "lowestHpAlly" && targets[0].hp / targets[0].attr.maxHp > 0.85) {
      this.skillReadyAt = e.world.time + 1000;
      return false;
    }
    e.skill.prepare(skillId, targets);
    return true;
  }
}
