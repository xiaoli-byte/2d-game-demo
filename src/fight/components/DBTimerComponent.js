// 逻辑动作时间轴（对应原游戏 DBTimerComponent / DBTimer）
// 不依赖动画是否渲染：按动作配置的帧数推进，到点触发帧事件（hit1、shake1...），播完回调。
import { FightConst } from "../../config/FightConst.js";

export class DBTimerComponent {
  constructor(entity, actions) {
    this.entity = entity;
    this.actions = actions;
    this.name = "";
    this.action = null;
    this.elapsed = 0;
    this.loop = false;
    this.done = false;
    this._eventIdx = 0;
    this._token = 0;
  }

  play(name, loop = false) {
    const action = this.actions[name];
    if (!action) throw new Error(`[DBTimer] 动作不存在: ${name}`);
    this.name = name;
    this.action = action;
    this.elapsed = 0;
    this.loop = loop || !!action.loop;
    this.done = false;
    this._eventIdx = 0;
    this._token++;
    this.entity.world.log("anim", `${this.entity.name} 播放动作 ${name}${this.loop ? "（循环）" : ""}`);
  }

  get duration() {
    return this.action ? this.action.frames * FightConst.FRAME_TIME : 0;
  }

  /** 当前所在帧（浮点），供表现层采样关键帧 */
  get frame() {
    return this.elapsed / FightConst.FRAME_TIME;
  }

  tick(dt) {
    if (!this.action || this.done) return;
    const token = this._token;
    this.elapsed += dt;
    const events = this.action.events || [];
    while (this._eventIdx < events.length && events[this._eventIdx].frame * FightConst.FRAME_TIME <= this.elapsed) {
      const ev = events[this._eventIdx++];
      this.entity.world.log("event", `${this.entity.name} ${this.name} 第 ${ev.frame} 帧 → 帧事件 ${ev.name}`);
      this.entity.onActionEvent(ev.name);
      if (token !== this._token) return; // 事件回调里切换了动作
    }
    const total = this.duration;
    if (this.elapsed >= total) {
      if (this.loop) {
        this.elapsed %= total;
        this._eventIdx = 0;
      } else {
        this.elapsed = total;
        this.done = true;
        this.entity.onActionComplete(this.name);
      }
    }
  }
}
