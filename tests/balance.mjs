// 数值平衡：跑多场实时战斗，统计胜率与时长（node tests/balance.mjs [场数]）
import { FightWorld } from "../src/fight/FightWorld.js";
import { FightConst } from "../src/config/FightConst.js";

const N = Number(process.argv[2] || 200);
let win = 0;
let timeout = 0;
const times = [];
const dmg = {};
const casts = { rage: 0, skill: 0 };
for (let seed = 1; seed <= N; seed++) {
  const w = new FightWorld({ seed });
  w.logEnabled = false;
  w.bus.on("skill", (d) => {
    if (d.conf.Type === 3) casts.rage++;
    if (d.conf.Type === 2) casts.skill++;
  });
  let n = 0;
  while (!w.ended && n++ < 20000) w.step();
  if (w.result === "win") win++;
  if (w.fightTime >= FightConst.FIGHT_TIME) timeout++;
  times.push(w.fightTime / 1000);
  for (const e of w.entities) dmg[e.name] = (dmg[e.name] || 0) + e.stats.damage + e.stats.heal;
}
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / N;
console.log(`场数 ${N}  胜率 ${((win / N) * 100).toFixed(1)}%  超时 ${timeout}`);
console.log(`时长 平均 ${avg.toFixed(1)}s  P10 ${times[Math.floor(N * 0.1)].toFixed(1)}s  P90 ${times[Math.floor(N * 0.9)].toFixed(1)}s`);
console.log(`每场 大招 ${(casts.rage / N).toFixed(1)} 次  小技能 ${(casts.skill / N).toFixed(1)} 次`);
for (const [k, v] of Object.entries(dmg)) console.log(`  ${k.padEnd(6, "　")} 场均输出/治疗 ${Math.round(v / N)}`);
