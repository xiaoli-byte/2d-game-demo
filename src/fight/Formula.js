// 伤害公式（对应原游戏 Formula.calcPhysicDamage / calcMagicDamage，经 SkillData.calcDamage 调用）
const DEF_K = 900; // 防御减伤常数：减伤率 = def / (def + DEF_K)

/**
 * @returns {{ value: number, crit: boolean, dodge: boolean }}
 */
export function calcDamage(caster, target, coef, damageType, rng) {
  if (rng.chance(target.attr.dodge)) return { value: 0, crit: false, dodge: true };
  const atk = caster.getAtk();
  // 法术伤害无视 30% 防御
  const def = damageType === 2 ? target.attr.def * 0.7 : target.attr.def;
  const reduce = def / (def + DEF_K);
  let value = atk * coef * (1 - reduce);
  const crit = rng.chance(caster.attr.crit);
  if (crit) value *= caster.attr.critDmg;
  value *= rng.range(0.95, 1.05);
  return { value: Math.max(1, Math.round(value)), crit, dodge: false };
}

export function calcHeal(caster, coef, rng) {
  return Math.round(caster.getAtk() * coef * rng.range(0.97, 1.03));
}
