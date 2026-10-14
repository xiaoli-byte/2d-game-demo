// 技能（对应原游戏 SkillComponent）
//
// 一次技能的完整时间线：
//   prepare        距离超出 ReleaseScope 时先追击接近（MoveComponent.chase），近战打完不回位
//   runSkill       写战报、扣/加怒气、播施法特效、按技能类型切状态（普攻 8 / 技能 9 / 大招 10）
//   帧事件 shake1  大招前摇：全场定格，表现层播放大招演出（onWinupAction）
//   帧事件 hitN    命中点：有弹道则发射，弹道到达时结算；否则立即对所有目标结算 HitEffN
//   dealHit        伤害/治疗/击退/击飞/震屏，播受击特效；第 1 段命中附加 Buff（addSkillBuff）
//   动作播完       回到站立状态，等待 AI 下一次出手
import { HeroSkillData } from "../../config/SkillData.js";
import { getHitEventCnt } from "../../config/ActionConfig.js";
import { Act, HitType, HpFlag, SkillType, State } from "../../config/FightConst.js";
import { calcDamage, calcHeal } from "../Formula.js";
import { engageDist } from "./MoveComponent.js";

const STATE_OF_TYPE = { [SkillType.NORMAL]: State.ATTACK, [SkillType.SKILL]: State.SKILL, [SkillType.RAGE]: State.RAGE };

export class SkillComponent {
  constructor(entity) {
    this.entity = entity;
    this.cur = null; // { id, conf, targets, hitCnt }
  }

  get running() {
    return !!this.cur;
  }

  /** AI 决定放技能后调用：超出施放距离先追击目标，进入距离后 runSkill（原游戏 selectSkill） */
  prepare(skillId, targets) {
    const e = this.entity;
    const conf = HeroSkillData[skillId];
    const t = targets[0];
    if (conf.ReleaseScope > 0 && t && t !== e && engageDist(e, t) > conf.ReleaseScope) {
      e.busy = true;
      e.world.log("ai", `${e.name} 距离不足，追击 ${t.name}`);
      e.move.chase(t, conf.ReleaseScope, () => {
        if (t.hp > 0) this.runSkill(skillId, targets.filter((x) => x.hp > 0));
        else this._finish();
      });
      return;
    }
    this.runSkill(skillId, targets);
  }

  runSkill(skillId, targets) {
    const e = this.entity;
    const w = e.world;
    const conf = HeroSkillData[skillId];
    const action = e.actions[conf.Action];
    this.cur = { id: skillId, conf, targets, hitCnt: Math.max(1, getHitEventCnt(action)) };
    e.busy = true;
    if (targets[0] && targets[0] !== e) e.facing = targets[0].x >= e.x ? 1 : -1;

    w.record(Act.SKILL, e.id, skillId, targets.map((t) => t.id));
    w.log("ai", `${e.name} 释放【${conf.Name}】→ ${targets.map((t) => t.name).join("、")}`);

    if (conf.Type === SkillType.RAGE) e.setRage(0);
    else if (conf.AddRage) e.setRage(e.rage + conf.AddRage);
    if (conf.Type === SkillType.SKILL) e.ai.skillReadyAt = w.time + conf.CD;

    w.bus.emit("skill", { caster: e, conf, targets });
    if (conf.Show.attack) w.bus.emit("fx", { list: conf.Show.attack, caster: e, target: targets[0] || e });
    w.bus.emit("sfx", { id: conf.Show.sfx && conf.Show.sfx.cast });
    e.fsm.changeState(STATE_OF_TYPE[conf.Type], { action: conf.Action });
  }

  onActionEvent(name) {
    if (!this.cur) return;
    if (name === "shake1") {
      this.entity.world.winup(this.entity, this.cur.conf);
      return;
    }
    if (name.startsWith("hit")) this.onHitPointEvents(+name.slice(3));
  }

  onHitPointEvents(n) {
    const e = this.entity;
    const w = e.world;
    const { conf, targets, hitCnt } = this.cur;
    const hitEff = conf.HitEff[Math.min(n, conf.HitEff.length) - 1];
    const isHeal = hitEff.some(([t]) => t === HitType.HEAL);
    const live = targets.filter((t) => (isHeal ? t.hp > 0 : t.hp > 0 && !t.dead));
    for (const target of live) {
      const hit = () => this.dealHit(e, conf, n, hitEff, target, hitCnt);
      if (conf.Show.bullet && target !== e) w.launchBullet(e, target, conf.Show.bullet, hit);
      else hit();
    }
  }

  /** 命中结算（静态方法式写法：弹道到达时技能可能已经结束，所以不依赖 this.cur） */
  dealHit(caster, conf, n, hitEff, target, hitCnt) {
    const w = caster.world;
    if (target.hp <= 0 && !hitEff.some(([t]) => t === HitType.HEAL)) return;
    const dir = target.x >= caster.x ? 1 : -1;
    let dodged = false;

    if (w.isLive) {
      for (const [type, p] of hitEff) {
        if (type === HitType.DAMAGE) {
          const r = calcDamage(caster, target, p, conf.DamageType, w.rng);
          if (r.dodge) {
            dodged = true;
            w.applyHp(target, 0, HpFlag.DODGE, caster, 0);
          } else {
            w.applyHp(target, -r.value, r.crit ? HpFlag.CRIT : HpFlag.NORMAL, caster);
            if (conf.RageBehit && target.hp > 0) target.setRage(target.rage + conf.RageBehit / hitCnt);
          }
        } else if (type === HitType.HEAL) {
          w.applyHp(target, calcHeal(caster, p, w.rng), HpFlag.HEAL, caster);
        }
      }
      if (n === 1 && conf.Buffs) this.addSkillBuff(caster, conf, target);
    } else {
      dodged = w.peekDodge(target);
    }

    if (dodged) return;
    for (const [type, p] of hitEff) {
      if (type === HitType.HITBACK && conf.Show.back) target.hitBack(dir, conf.Show.back);
      else if (type === HitType.HITFLY && conf.Show.fly) target.hitFly(dir, conf.Show.fly);
      else if (type === HitType.SHAKE) w.bus.emit("shake", { type: p });
    }
    if (conf.Show.hurt) w.bus.emit("fx", { list: conf.Show.hurt, caster, target });
    w.bus.emit("sfx", { id: conf.Show.sfx && conf.Show.sfx.hit });
    w.bus.emit("hit", { caster, target, conf, n });
  }

  addSkillBuff(caster, conf, target) {
    const w = caster.world;
    for (const b of conf.Buffs) {
      const who = b.to === "self" ? caster : target;
      if (who.hp <= 0 || !w.rng.chance(b.chance)) continue;
      let value = 0;
      if (b.coef) value = caster.getAtk() * b.coef;
      else if (b.id === "rage") value = 0.3;
      who.buff.add(b.id, caster, value);
    }
  }

  onActionComplete() {
    this.cur = null;
    this._finish();
  }

  _finish() {
    const e = this.entity;
    e.busy = false;
    if (e.hp > 0 && e.fsm.state !== State.DIE) {
      e.fsm.changeState(e.world.ended ? State.WIN : State.STAND);
    }
  }

  /** 打断当前技能（被击飞、死亡时） */
  interrupt() {
    if (!this.cur && !this.entity.move.moving) return;
    this.cur = null;
    this.entity.busy = false;
  }
}
