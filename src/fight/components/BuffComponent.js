// Buff（对应原游戏 BuffComponent.addBuff / Conf.BuffData）
// 同组互斥：新 Buff 优先级 >= 旧的则替换（同级刷新时长），否则忽略。
// 回放模式下 Buff 的增删和护盾吸收都来自战报，不自己计时、不自己结算持续伤害。
import { BuffData } from "../../config/BuffData.js";
import { Act, HpFlag } from "../../config/FightConst.js";

export class BuffComponent {
  constructor(entity) {
    this.entity = entity;
    this.list = [];
  }

  get(id) {
    return this.list.find((b) => b.id === id);
  }

  /**
   * @param value 护盾值 / 持续伤害每跳 / 攻击加成；为空时按配置与施法者攻击计算
   */
  add(id, caster, value = null) {
    const e = this.entity;
    if (e.hp <= 0) return null;
    const conf = BuffData[id];
    const same = this.list.find((b) => b.conf.Group === conf.Group);
    if (same && same.conf.Priority > conf.Priority) return null;
    if (same) this._removeEntry(same, false);

    const buff = { id, conf, caster, remain: conf.Duration, tick: conf.Interval || 0, value: value ?? 0 };
    this.list.push(buff);
    e.world.record(Act.BUFF, e.id, id, 1, Math.round(buff.value), caster ? caster.id : -1);
    e.world.log("buff", `${e.name} 获得 ${conf.Name}${buff.value ? `（${Math.round(buff.value)}）` : ""}`);
    e.world.bus.emit("buff", { entity: e, buff, on: true });
    return buff;
  }

  remove(id) {
    const b = this.get(id);
    if (b) this._removeEntry(b, true);
  }

  _removeEntry(b, notify) {
    const e = this.entity;
    this.list.splice(this.list.indexOf(b), 1);
    if (notify) {
      e.world.record(Act.BUFF, e.id, b.id, 0, 0, -1);
      e.world.log("buff", `${e.name} 的 ${b.conf.Name} 消失`);
    }
    e.world.bus.emit("buff", { entity: e, buff: b, on: false });
  }

  clear() {
    for (const b of this.list.slice()) this._removeEntry(b, false);
  }

  /** 是否被控（isUnable / _ctrlBuffCnt > 0），被控时 AI 不行动 */
  isUnable() {
    return this.list.some((b) => b.conf.Control);
  }

  atkBonus() {
    return this.list.reduce((s, b) => s + (b.conf.Type === "atkUp" ? b.value : 0), 0);
  }

  shieldValue() {
    return this.list.reduce((s, b) => s + (b.conf.Type === "shield" ? b.value : 0), 0);
  }

  /** 护盾吸收伤害，返回吸收量 */
  absorb(amount) {
    let left = amount;
    for (const b of this.list.slice()) {
      if (b.conf.Type !== "shield" || left <= 0) continue;
      const used = Math.min(b.value, left);
      b.value -= used;
      left -= used;
      if (b.value <= 0.5 && this.entity.world.isLive) this._removeEntry(b, true);
    }
    return amount - left;
  }

  tick(dt) {
    const e = this.entity;
    if (!e.world.isLive || e.hp <= 0 || e.world.ended) return;
    for (const b of this.list.slice()) {
      b.remain -= dt;
      if (b.conf.Type === "dot") {
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick += b.conf.Interval;
          e.world.applyHp(e, -Math.round(b.value), HpFlag.DOT, b.caster, 0);
          if (e.hp <= 0) return;
        }
      }
      if (b.remain <= 0 && this.list.includes(b)) this._removeEntry(b, true);
    }
  }
}
