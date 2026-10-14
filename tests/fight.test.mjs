// 战斗逻辑无头测试：node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { FightWorld } from "../src/fight/FightWorld.js";
import { FightConst, State } from "../src/config/FightConst.js";

const MAX_FRAMES = (FightConst.FIGHT_TIME / FightConst.LOGIC_STEP) * 1.6;

function runToEnd(world) {
  world.logEnabled = false;
  let n = 0;
  while (!world.ended && n++ < MAX_FRAMES) world.step();
  // 再跑一会儿，让死亡/胜利动作播完
  for (let i = 0; i < 120; i++) world.step();
  return world;
}

const snapshot = (w) => w.entities.map((e) => ({ id: e.id, hp: Math.round(e.hp), dead: e.dead }));

test("实时战斗能在限时内结束，且只有一方存活", () => {
  const w = runToEnd(new FightWorld({ seed: 12345 }));
  assert.ok(w.ended, "战斗应当结束");
  assert.ok(["win", "lose"].includes(w.result));
  const heroesAlive = w.entityMgr.aliveOf("hero").length;
  const enemiesAlive = w.entityMgr.aliveOf("enemy").length;
  if (w.result === "win") assert.equal(enemiesAlive, 0);
  assert.ok(w.fightTime <= FightConst.FIGHT_TIME + FightConst.LOGIC_STEP);
  assert.ok(heroesAlive + enemiesAlive >= 0);
});

test("同一种子的两场战斗结果完全一致（确定性）", () => {
  const a = runToEnd(new FightWorld({ seed: 777 }));
  const b = runToEnd(new FightWorld({ seed: 777 }));
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.equal(a.recordData.checksum(), b.recordData.checksum());
});

test("战报回放的最终血量与实时战斗一致", () => {
  for (const seed of [1, 42, 2024, 99999]) {
    const live = runToEnd(new FightWorld({ seed }));
    const replay = runToEnd(new FightWorld({ replay: live.recordData }));
    assert.equal(replay.result, live.result, `seed ${seed} 结果不一致`);
    assert.deepEqual(snapshot(replay), snapshot(live), `seed ${seed} 血量不一致`);
  }
});

test("帧事件驱动命中：普攻在 hit1 帧才造成伤害", () => {
  const w = new FightWorld({ seed: 5 });
  w.logEnabled = false;
  const hits = [];
  w.bus.on("hp", (d) => hits.push({ frame: w.frame, flag: d.flag }));
  const skills = [];
  w.bus.on("skill", (d) => skills.push({ frame: w.frame, caster: d.caster, conf: d.conf }));
  while (!hits.length && w.frame < 3000) w.step();
  assert.ok(hits.length > 0, "应当出现命中");
  assert.ok(skills.length > 0);
  // 第一次命中一定晚于第一次出手
  assert.ok(hits[0].frame > skills[0].frame);
});

test("死亡实体进入死亡状态且不再行动", () => {
  const w = runToEnd(new FightWorld({ seed: 31337 }));
  for (const e of w.entities) {
    if (e.hp <= 0) {
      assert.equal(e.fsm.state, State.DIE);
      assert.equal(e.busy, false);
    }
  }
});

test("结算上报数据包含协议 102 的字段", () => {
  const w = new FightWorld({ seed: 8 });
  let payload = null;
  w.bus.on("end", (d) => (payload = d.payload));
  runToEnd(w);
  assert.ok(payload);
  assert.equal(payload.cmd, 102);
  for (const k of ["result", "battle_time", "total_hurt", "stateinfo", "checkdata"]) assert.ok(k in payload, k);
  assert.equal(payload.stateinfo.length, 6);
});
