// 状态机（对应原游戏 StateMachineComponent + EntityFSM）
// 状态编号与原游戏一致；Translate 为切换白名单：
//   站立/受击 可切到任意状态；击飞只能 → 击飞/死亡；死亡、胜利为终态。
import { State, StateName } from "../../config/FightConst.js";
import { Ease } from "../../core/Ease.js";

const ANY = Object.values(State);
const Translate = {
  [State.STAND]: ANY,
  [State.BEHIT]: ANY,
  [State.MOVE]: ANY,
  [State.ATTACK]: [State.STAND, State.MOVE, State.HITFLY, State.DIE, State.WIN],
  [State.SKILL]: [State.STAND, State.MOVE, State.HITFLY, State.DIE, State.WIN],
  [State.RAGE]: [State.STAND, State.MOVE, State.DIE, State.WIN],
  [State.HITFLY]: [State.STAND, State.HITFLY, State.DIE],
  [State.DIE]: [],
  [State.WIN]: [State.DIE],
};
/** 不可被技能打断的状态（UnableState） */
export const UNABLE_STATES = [State.HITFLY];

export class StateMachineComponent {
  constructor(entity) {
    this.entity = entity;
    this.state = 0;
    this.data = null;
    this._fly = null;
  }

  canChange(to) {
    if (this.state === 0) return true;
    return (Translate[this.state] || []).includes(to);
  }

  changeState(to, data = null) {
    if (!this.canChange(to)) return false;
    const from = this.state;
    this.state = to;
    this.data = data;
    const e = this.entity;
    if (from !== to) e.world.log("state", `${e.name} 状态 ${StateName[from] || "-"} → ${StateName[to]}`);
    switch (to) {
      case State.STAND:
        e.timer.play("loading", true);
        break;
      case State.MOVE:
        e.timer.play("run", true);
        break;
      case State.BEHIT:
        e.timer.play("behit");
        break;
      case State.ATTACK:
      case State.SKILL:
      case State.RAGE:
        e.timer.play(data.action);
        break;
      case State.HITFLY:
        e.skill.interrupt();
        e.move.stop();
        this._fly = { ...data, t: 0, landed: false };
        e.timer.play("float_behit", true);
        break;
      case State.DIE:
        e.skill.interrupt();
        e.move.stop();
        e.timer.play("dead");
        break;
      case State.WIN:
        e.timer.play("win", true);
        break;
      default:
        break;
    }
    return true;
  }

  /** 击飞：二次贝塞尔抛物线，前半段 sineOut 上升，后半段 quadIn 下落 */
  tick(dt) {
    const e = this.entity;
    if (this.state === State.HITFLY && this._fly && !this._fly.landed) {
      const f = this._fly;
      f.t += dt;
      const p = Math.min(1, f.t / f.time);
      const yT = p < 0.5 ? Ease.sineOut(p * 2) : 1 - Ease.quadIn((p - 0.5) * 2);
      e.flyX = f.dir * f.width * Ease.sineOut(p);
      e.liftY = -f.height * yT;
      if (p >= 1) {
        f.landed = true;
        e.liftY = 0;
        e.world.bus.emit("land", { entity: e });
        if (e.hp <= 0) this.changeState(State.DIE);
        else e.timer.play("up1");
      }
    }
    // 落地后慢慢回到站位
    if (this.state !== State.HITFLY && e.flyX) {
      e.flyX *= Math.pow(0.0015, dt / 1000);
      if (Math.abs(e.flyX) < 0.5) e.flyX = 0;
    }
  }

  /** 动作播完（DBTimer.completeHandler → handlerMsg msgType 0） */
  onActionComplete(name) {
    const e = this.entity;
    switch (this.state) {
      case State.BEHIT:
        this.changeState(State.STAND);
        break;
      case State.HITFLY:
        if (name === "up1") this.changeState(State.STAND);
        break;
      case State.ATTACK:
      case State.SKILL:
      case State.RAGE:
        e.skill.onActionComplete();
        break;
      case State.DIE:
        e.deathDone = true;
        break;
      default:
        break;
    }
  }
}
