// 战斗世界（对应原游戏 FightView 的逻辑部分 + ComponentMgr 的逐帧 tick）
//
// - 固定步长推进（FightConst.LOGIC_STEP），倍速只改变每帧推进的步数，因此结果与倍速无关
// - 两种模式：live 实时模拟（AI + 伤害公式 + 录战报）；replay 按战报回放（FightCommand）
// - 定格（freeze）：暴击顿帧、大招前摇，期间整个战场时间停止
// - 只通过 bus 通知表现层，不接触任何渲染 API
import { FightConst, State, Act, HpFlag } from "../config/FightConst.js";
import { EventBus } from "../core/EventBus.js";
import { Random } from "../core/Random.js";
import { EntityMgr } from "./EntityMgr.js";
import { FightRecord } from "./FightRecord.js";
import { FightCommand } from "./FightCommand.js";

export class FightWorld {
  /**
   * @param {object} opt
   * @param {number} [opt.seed]   实时模式的随机种子
   * @param {FightRecord} [opt.replay] 传入战报则进入回放模式
   * @param {EventBus} [opt.bus]
   */
  constructor(opt = {}) {
    this.bus = opt.bus || new EventBus();
    this.mode = opt.replay ? "replay" : "live";
    this.rng = new Random(opt.replay ? opt.replay.seed : opt.seed);
    this.recordData = this.isLive ? new FightRecord(this.rng.seed) : opt.replay;
    this.command = this.isLive ? null : new FightCommand(this, opt.replay);

    this.time = 0; // 战场时间（ms，不含定格）
    this.frame = 0; // 逻辑帧号
    this.fightTime = 0; // 开打后的计时
    this.timeScale = 1;
    this.paused = false;
    this.autoRage = true;
    this.freezeLeft = 0;
    this.phase = "enter"; // enter → fight → end
    this.result = null;
    this.bullets = [];
    this._bulletId = 1;
    this._acc = 0;
    this._dodged = new Set();
    this.logEnabled = true;

    this.entityMgr = new EntityMgr(this);
    this.entityMgr.createAll();
    for (const e of this.entityMgr.list) e.move.entrance();
  }

  get isLive() {
    return this.mode === "live";
  }

  get fighting() {
    return this.phase === "fight";
  }

  get ended() {
    return this.phase === "end";
  }

  get entities() {
    return this.entityMgr.list;
  }

  log(cat, text) {
    if (this.logEnabled) this.bus.emit("log", { cat, text, t: this.fightTime });
  }

  record(...act) {
    if (this.isLive && this.phase !== "end") this.recordData.add(this.frame, act);
  }

  /** 真实时间推进（ms），由主循环每帧调用 */
  update(realDt) {
    if (this.paused) return;
    this._acc += Math.min(realDt, 100) * this.timeScale;
    let steps = 0;
    while (this._acc >= FightConst.LOGIC_STEP && steps < 12) {
      this._acc -= FightConst.LOGIC_STEP;
      this.step();
      steps++;
    }
  }

  /** 推进一个逻辑帧 */
  step() {
    const dt = FightConst.LOGIC_STEP;
    if (this.freezeLeft > 0) {
      this.freezeLeft -= dt;
      return;
    }
    this.frame++;
    this.time += dt;
    this._dodged.clear();
    if (this.command) this.command.tick(this.frame);

    if (this.phase === "enter" && this.time >= FightConst.ENTER_TIME + 250) {
      this.phase = "fight";
      this.bus.emit("fightStart", {});
      this.log("rec", "战斗开始");
    }
    if (this.fighting) {
      this.fightTime += dt;
      if (this.isLive && this.fightTime >= FightConst.FIGHT_TIME) this.finish("lose", "timeout");
    }

    for (const e of this.entities) e.tick(dt);
    this._tickBullets(dt);
  }

  // ---------------------------------------------------------------- 弹道
  launchBullet(caster, target, conf, onArrive) {
    const sx = caster.x + caster.facing * 40;
    const sy = caster.bodyY(conf.fromY || 0.6);
    const tx = target.x;
    const ty = target.bodyY(0.5);
    const dur = (Math.hypot(tx - sx, ty - sy) / conf.speed) * 1000;
    const b = { id: this._bulletId++, caster, target, conf, sx, sy, x: sx, y: sy, t: 0, dur: Math.max(120, dur), onArrive, angle: 0 };
    this.bullets.push(b);
    this.bus.emit("bullet", { bullet: b, on: true });
    return b;
  }

  _tickBullets(dt) {
    for (const b of this.bullets.slice()) {
      b.t += dt;
      const p = Math.min(1, b.t / b.dur);
      // 追踪目标当前位置，二次曲线抛物
      const tx = b.target.drawX;
      const ty = b.target.bodyY(0.5);
      const px = b.x;
      const py = b.y;
      b.x = b.sx + (tx - b.sx) * p;
      b.y = b.sy + (ty - b.sy) * p - b.conf.arc * 4 * p * (1 - p);
      b.angle = Math.atan2(b.y - py, b.x - px);
      if (p >= 1) {
        this.bullets.splice(this.bullets.indexOf(b), 1);
        this.bus.emit("bullet", { bullet: b, on: false });
        b.onArrive();
      }
    }
  }

  // ---------------------------------------------------------------- 血量
  /**
   * 统一的血量变化入口（实时模式由技能/持续伤害调用，回放模式由战报调用）
   * @param delta 负数伤害，正数治疗
   * @param absorbed 回放模式下战报给出的护盾吸收量
   */
  applyHp(target, delta, flag, source, absorbed = null) {
    // 结算之后不再有任何血量变化（飞行中的弹道、持续伤害都作废），保证与战报一致
    if (!target || target.hp <= 0 || this.ended) return;
    if (flag === HpFlag.DODGE) {
      this._dodged.add(target.id);
      this.record(Act.HP, target.id, 0, flag, 0, source ? source.id : -1);
      this.log("dmg", `${target.name} 闪避了 ${source ? source.name : ""} 的攻击`);
      this.bus.emit("hp", { target, delta: 0, flag, source, absorbed: 0 });
      return;
    }

    let absorb = 0;
    if (delta < 0) {
      if (this.isLive) {
        absorb = target.buff.absorb(-delta);
        delta += absorb;
      } else {
        absorb = absorbed || 0;
        if (absorb) target.buff.absorb(absorb);
      }
    }

    const before = target.hp;
    target.hp = Math.max(0, Math.min(target.attr.maxHp, target.hp + delta));
    const real = target.hp - before;
    this.record(Act.HP, target.id, delta, flag, absorb, source ? source.id : -1);

    if (source) {
      if (delta < 0) source.stats.damage += -delta + absorb;
      else source.stats.heal += real;
    }
    if (delta < 0) target.stats.taken += -delta;

    const kind = { [HpFlag.CRIT]: "暴击", [HpFlag.HEAL]: "治疗", [HpFlag.DOT]: "持续伤害" }[flag] || "伤害";
    this.log("dmg", `${source ? source.name : "?"} → ${target.name} ${kind} ${Math.abs(delta)}${absorb ? `（护盾吸收 ${absorb}）` : ""}，剩余 ${Math.round(target.hp)}`);
    this.bus.emit("hp", { target, delta, flag, source, absorbed: absorb });

    if (delta < 0 && flag !== HpFlag.DOT) target.onHurt();
    if (flag === HpFlag.CRIT) this.freezeLeft = Math.max(this.freezeLeft, FightConst.HITSTOP_CRIT);

    if (target.hp <= 0) {
      target.die();
      this._checkEnd();
    }
  }

  /** 回放模式：本帧该目标是否闪避（决定是否播放击退等受击表现） */
  peekDodge(target) {
    return this._dodged.has(target.id);
  }

  // ---------------------------------------------------------------- 大招前摇
  /** shake1 帧事件：全场定格，表现层播放大招演出（原游戏 onWinupAction） */
  winup(caster, conf) {
    this.freezeLeft = Math.max(this.freezeLeft, FightConst.WINUP_TIME);
    this.log("event", `${caster.name} 大招前摇定格 ${FightConst.WINUP_TIME}ms`);
    this.bus.emit("winup", { caster, conf, time: FightConst.WINUP_TIME });
  }

  requestRage(entityId) {
    const e = this.entityMgr.get(entityId);
    if (e && e.hp > 0 && this.isLive) e.ai.requestRage();
  }

  // ---------------------------------------------------------------- 结算
  _checkEnd() {
    if (!this.isLive || this.ended) return;
    if (!this.entityMgr.aliveOf("enemy").length) this.finish("win", "kill");
    else if (!this.entityMgr.aliveOf("hero").length) this.finish("lose", "kill");
  }

  finish(result, reason) {
    if (this.ended) return;
    if (this.isLive) this.record(Act.END, result === "win" ? 1 : 0, reason);
    this.phase = "end";
    this.result = result;
    this.log("rec", `战斗结束：${result === "win" ? "胜利" : "失败"}（${reason === "timeout" ? "超时" : "全灭"}）`);
    for (const e of this.entities) {
      if (e.hp > 0 && !e.busy && e.fsm.state !== State.HITFLY) e.fsm.changeState(State.WIN);
    }
    this.bus.emit("end", { result, reason, payload: this.buildVerifyPayload(result) });
  }

  /** 结算上报数据（原游戏协议 102：result, battle_time, total_hurt, stateinfo, checkdata） */
  buildVerifyPayload(result) {
    const heroes = this.entityMgr.of("hero");
    return {
      cmd: 102,
      result: result === "win" ? 1 : 0,
      battle_time: Math.round(this.fightTime),
      total_hurt: Math.round(heroes.reduce((s, e) => s + e.stats.damage, 0)),
      stateinfo: this.entities.map((e) => ({ id: e.id, hp: Math.round(e.hp), rage: Math.round(e.rage) })),
      checkdata: { seed: this.rng.seed, ...this.recordData.summary(), crc: this.recordData.checksum() },
    };
  }
}
