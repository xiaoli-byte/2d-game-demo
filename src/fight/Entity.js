// 战斗实体（对应原游戏 BaseEntity + EntityMgr 管理的组件集合）
// 组件按固定顺序 tick：Buff → AI → Move → DBTimer(帧事件) → 状态机
import { FightConst, State, Act } from "../config/FightConst.js";
import { getActions } from "../config/ActionConfig.js";
import { Ease } from "../core/Ease.js";
import { DBTimerComponent } from "./components/DBTimerComponent.js";
import { StateMachineComponent } from "./components/StateMachineComponent.js";
import { MoveComponent } from "./components/MoveComponent.js";
import { SkillComponent } from "./components/SkillComponent.js";
import { BuffComponent } from "./components/BuffComponent.js";
import { AIComponent } from "./components/AIComponent.js";

export class Entity {
  constructor(world, id, side, conf, pos) {
    this.world = world;
    this.id = id;
    this.side = side;
    this.conf = conf;
    this.name = conf.Name;
    this.attr = { ...conf.Attr };
    this.hp = this.attr.maxHp;
    this.rage = side === "hero" ? 20 : 10;
    this.homeX = pos.x;
    this.homeY = pos.y;
    this.x = pos.x;
    this.y = pos.y;
    /** 默认朝向：我方朝右 1，敌方朝左 -1 */
    this.faceDir = side === "hero" ? 1 : -1;
    this.facing = this.faceDir;
    this.busy = false;
    this.dead = false;
    this.deathDone = false;

    // 表现用偏移（击退 / 击飞），逻辑层负责计算，渲染层直接读取
    this.knockX = 0;
    this.flyX = 0;
    this.liftY = 0;
    this._knock = null;

    this.stats = { damage: 0, heal: 0, taken: 0 };

    this.actions = getActions(conf.Archetype);
    this.timer = new DBTimerComponent(this, this.actions);
    this.fsm = new StateMachineComponent(this);
    this.move = new MoveComponent(this);
    this.skill = new SkillComponent(this);
    this.buff = new BuffComponent(this);
    this.ai = new AIComponent(this);
  }

  get isHome() {
    return Math.abs(this.x - this.homeX) < 2 && Math.abs(this.y - this.homeY) < 2;
  }

  /** 头顶位置（over_head 特效、血条） */
  get headY() {
    return this.y - this.conf.Hight;
  }

  /** 身体某个高度比例处的 y（0 脚底，1 头顶） */
  bodyY(ratio) {
    return this.y + this.liftY - this.conf.Hight * ratio;
  }

  get drawX() {
    return this.x + this.knockX + this.flyX;
  }

  getAtk() {
    return this.attr.atk * (1 + this.buff.atkBonus());
  }

  setRage(v) {
    const nv = Math.max(0, Math.min(FightConst.MAX_RAGE, v));
    if (Math.round(nv * 10) === Math.round(this.rage * 10)) return;
    this.rage = nv;
    this.world.record(Act.RAGE, this.id, Math.round(nv * 10) / 10);
  }

  onActionEvent(name) {
    this.skill.onActionEvent(name);
  }

  onActionComplete(name) {
    this.fsm.onActionComplete(name);
  }

  /** 击退（StateHitBack）：位移 width，sineOut 缓动，停留后回到原位 */
  hitBack(dir, back) {
    if (this.fsm.state === State.HITFLY || this.hp <= 0) return;
    this._knock = { dir, width: back.width, time: back.time, t: 0 };
    if (this.fsm.state === State.STAND) this.fsm.changeState(State.BEHIT);
  }

  /** 击飞（StateHitFly） */
  hitFly(dir, fly) {
    if (this.hp <= 0 && this.fsm.state === State.DIE) return;
    this.fsm.changeState(State.HITFLY, { dir, width: fly.width, height: fly.height, time: fly.time });
  }

  /** 受击：站立时播受击动作（原游戏只有站立状态才切受击） */
  onHurt() {
    if (this.fsm.state === State.STAND) this.fsm.changeState(State.BEHIT);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.buff.clear();
    this.world.record(Act.DEAD, this.id);
    this.world.log("state", `${this.name} 阵亡`);
    if (this.fsm.state !== State.HITFLY) this.fsm.changeState(State.DIE);
  }

  tick(dt) {
    this.buff.tick(dt);
    this.ai.tick(dt);
    this.move.tick(dt);
    this.timer.tick(dt);
    this.fsm.tick(dt);
    if (this._knock) {
      const k = this._knock;
      k.t += dt;
      const hold = 120;
      const back = 280;
      let p;
      if (k.t < k.time) p = Ease.sineOut(k.t / k.time);
      else if (k.t < k.time + hold) p = 1;
      else p = Math.max(0, 1 - Ease.sineInOut((k.t - k.time - hold) / back));
      this.knockX = k.dir * k.width * p;
      if (k.t >= k.time + hold + back) {
        this._knock = null;
        this.knockX = 0;
      }
    }
  }
}
