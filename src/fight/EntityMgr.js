// 实体管理（对应原游戏 EntityMgr）：创建、查询、索敌用的存活列表
import { HeroData, Formation } from "../config/HeroData.js";
import { FightConst } from "../config/FightConst.js";
import { Entity } from "./Entity.js";

export class EntityMgr {
  constructor(world) {
    this.world = world;
    this.list = [];
    this._byId = new Map();
  }

  createAll() {
    let id = 1;
    for (const side of ["hero", "enemy"]) {
      for (const slot of Formation[side]) {
        const e = new Entity(this.world, id++, side, HeroData[slot.id], slot);
        this.list.push(e);
        this._byId.set(e.id, e);
      }
    }
  }

  get(id) {
    return this._byId.get(id);
  }

  of(side) {
    return this.list.filter((e) => e.side === side);
  }

  aliveOf(side) {
    return this.list.filter((e) => e.side === side && e.hp > 0);
  }

  /** 战场中心线 x，用于镜像与镜头 */
  get centerX() {
    return FightConst.STAGE_W / 2;
  }
}
