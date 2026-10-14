// 移动（对应原游戏 MoveComponent）：入场、追击目标到施放距离、回位
// 追击时每帧按目标当前位置修正终点：双方同时冲锋也会在各自的攻击距离处停下，不会重叠
import { FightConst, State, Act } from "../../config/FightConst.js";

/** 带纵向权重的距离：同一条线上的敌人更"近" */
export function engageDist(a, b) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * 1.6);
}

export class MoveComponent {
  constructor(entity) {
    this.entity = entity;
    this.target = null; // { x, y } 固定终点
    this.chaseTarget = null; // 追击的实体
    this.range = 0;
    this.speed = FightConst.MOVE_SPEED;
    this.onArrive = null;
  }

  get moving() {
    return !!(this.target || this.chaseTarget);
  }

  /** 开场入场：从阵型外侧走到站位（onEntrance / ENTER_DISTANCE） */
  entrance() {
    const e = this.entity;
    e.x = e.homeX - e.faceDir * FightConst.ENTER_DISTANCE;
    this.speed = (FightConst.ENTER_DISTANCE / FightConst.ENTER_TIME) * 1000;
    this.target = { x: e.homeX, y: e.homeY };
    this.onArrive = () => {
      this.speed = FightConst.MOVE_SPEED;
      e.fsm.changeState(State.STAND);
    };
    e.fsm.changeState(State.MOVE);
  }

  /** 追击目标，进入 range 后回调 */
  chase(target, range, onArrive = null) {
    const e = this.entity;
    e.world.record(Act.MOVE, e.id, 0, 0, target.id, range);
    this.target = null;
    this.chaseTarget = target;
    this.range = range;
    this.speed = FightConst.MOVE_SPEED;
    this.onArrive = onArrive;
    e.facing = target.x >= e.x ? 1 : -1;
    e.fsm.changeState(State.MOVE);
  }

  moveTo(x, y, onArrive = null) {
    const e = this.entity;
    e.world.record(Act.MOVE, e.id, Math.round(x), Math.round(y), -1, 0);
    this.chaseTarget = null;
    this.speed = FightConst.MOVE_SPEED;
    this.target = { x, y };
    this.onArrive = onArrive;
    if (Math.abs(x - e.x) > 1) e.facing = x > e.x ? 1 : -1;
    e.fsm.changeState(State.MOVE);
  }

  stop() {
    this.target = null;
    this.chaseTarget = null;
    this.onArrive = null;
  }

  _arrive() {
    const e = this.entity;
    const cb = this.onArrive;
    this.stop();
    if (cb) cb();
    else if (e.fsm.state === State.MOVE) e.fsm.changeState(State.STAND);
  }

  tick(dt) {
    const e = this.entity;
    const step = (this.speed * dt) / 1000;
    if (this.chaseTarget) {
      const t = this.chaseTarget;
      if (t.hp <= 0) return this._arrive();
      if (engageDist(e, t) <= this.range) return this._arrive();
      // 终点：距离目标 range*0.85，纵向偏向自己的站位线，多人围攻同一目标时不会叠在一起
      const dir = t.x >= e.x ? 1 : -1;
      const tx = t.x - dir * this.range * 0.85;
      const ty = t.y * 0.45 + e.homeY * 0.55;
      const dx = tx - e.x;
      const dy = ty - e.y;
      const dist = Math.hypot(dx, dy);
      e.facing = dir;
      if (dist <= step) {
        e.x = tx;
        e.y = ty;
        return this._arrive();
      }
      e.x += (dx / dist) * step;
      e.y += (dy / dist) * step;
      return;
    }
    if (!this.target) return;
    const dx = this.target.x - e.x;
    const dy = this.target.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= step) {
      e.x = this.target.x;
      e.y = this.target.y;
      this._arrive();
    } else {
      e.x += (dx / dist) * step;
      e.y += (dy / dist) * step;
    }
  }
}
