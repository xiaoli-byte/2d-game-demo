// 战报回放（对应原游戏 FightCommand.tick → dealMsgV1 → onCommandXXX）
// 按逻辑帧号把战报里的动作分发给实体：技能、移动由组件照常表现，血量和 Buff 直接按战报设置。
import { Act } from "../config/FightConst.js";

export class FightCommand {
  constructor(world, record) {
    this.world = world;
    this.record = record;
    this.index = 0;
  }

  get finished() {
    return this.index >= this.record.frames.length;
  }

  tick(frame) {
    const frames = this.record.frames;
    while (this.index < frames.length && frames[this.index].t <= frame) {
      for (const act of frames[this.index].a) this.dealMsg(act);
      this.index++;
    }
  }

  dealMsg(act) {
    const w = this.world;
    const ent = (id) => w.entityMgr.get(id);
    switch (act[0]) {
      case Act.SKILL: {
        // [SKILL, 施法者, 技能id, 目标列表]
        const caster = ent(act[1]);
        caster.skill.runSkill(act[2], act[3].map(ent));
        break;
      }
      case Act.HP: {
        // [HP, 目标, 变化量, 标记, 护盾吸收, 来源]
        w.applyHp(ent(act[1]), act[2], act[3], ent(act[5]), act[4]);
        break;
      }
      case Act.BUFF: {
        // [BUFF, 目标, buffId, 1加/0移除, 数值, 来源]
        const target = ent(act[1]);
        if (act[3] === 1) target.buff.add(act[2], ent(act[5]), act[4]);
        else target.buff.remove(act[2]);
        break;
      }
      case Act.RAGE:
        ent(act[1]).setRage(act[2]);
        break;
      case Act.MOVE: {
        // [MOVE, 实体, x, y, 追击目标(-1 表示定点), 距离]
        const e = ent(act[1]);
        if (act[4] >= 0) e.move.chase(ent(act[4]), act[5]);
        else e.move.moveTo(act[2], act[3]);
        break;
      }
      case Act.END:
        w.finish(act[1] === 1 ? "win" : "lose", act[2]);
        break;
      default:
        break;
    }
  }
}
