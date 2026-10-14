// 战报录制（对应原游戏 FightRecord.setActDataXXX）
// 每一帧发生的关键动作记成 { t: 逻辑帧号, a: [[eActType, ...参数], ...] }。
// PVP 时服务器下发的就是这种战报，客户端用 FightCommand 回放，不跑 AI 也不算伤害。
import { Act } from "../config/FightConst.js";

export class FightRecord {
  constructor(seed) {
    this.version = 1;
    this.seed = seed;
    this.frames = [];
  }

  add(t, act) {
    const last = this.frames[this.frames.length - 1];
    if (last && last.t === t) last.a.push(act);
    else this.frames.push({ t, a: [act] });
  }

  get actCount() {
    return this.frames.reduce((n, f) => n + f.a.length, 0);
  }

  /** 统计（用于结算上报的校验数据，对应原游戏 FightVerify） */
  summary() {
    const out = { skills: 0, hits: 0, crits: 0, buffs: 0, deaths: 0 };
    for (const f of this.frames) {
      for (const a of f.a) {
        if (a[0] === Act.SKILL) out.skills++;
        else if (a[0] === Act.HP) {
          out.hits++;
          if (a[3] === 1) out.crits++;
        } else if (a[0] === Act.BUFF && a[3] === 1) out.buffs++;
        else if (a[0] === Act.DEAD) out.deaths++;
      }
    }
    return out;
  }

  /** 简单的 32 位校验和 */
  checksum() {
    const s = JSON.stringify(this.frames);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  toJSON() {
    return { version: this.version, seed: this.seed, frames: this.frames };
  }
}
