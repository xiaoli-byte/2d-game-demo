// 目标选择（对应原游戏 AIComponent.getAITarget / SkillComponent.setSkillTargets）
const AREA_RADIUS = 250;

function nearest(self, list) {
  let best = null;
  let bestD = Infinity;
  for (const e of list) {
    const d = Math.abs(e.x - self.x) * 1.0 + Math.abs(e.y - self.y) * 0.35;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function selectTargets(world, self, rule) {
  const enemies = world.entityMgr.aliveOf(self.side === "hero" ? "enemy" : "hero");
  const allies = world.entityMgr.aliveOf(self.side);
  switch (rule) {
    case "self":
      return [self];
    case "all":
      return enemies;
    case "random":
      return enemies.length ? [world.rng.pick(enemies)] : [];
    case "lowestHpAlly": {
      let best = null;
      for (const a of allies) if (!best || a.hp / a.attr.maxHp < best.hp / best.attr.maxHp) best = a;
      return best ? [best] : [];
    }
    case "frontArea": {
      const f = nearest(self, enemies);
      if (!f) return [];
      return [f, ...enemies.filter((e) => e !== f && Math.hypot(e.x - f.x, (e.y - f.y) * 1.4) < AREA_RADIUS)];
    }
    case "front":
    default: {
      const f = nearest(self, enemies);
      return f ? [f] : [];
    }
  }
}
