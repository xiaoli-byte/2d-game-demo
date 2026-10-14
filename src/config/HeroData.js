// 角色配置（对应原游戏 Conf.HeroData / MonsterData）
//   Modle      素材名前缀：assets/<Modle>_<pose>.png
//   Archetype  动作模板（ActionConfig）
//   Hight      角色显示高度（px），用于头顶血条、over_head 特效定位
//   Skills     普攻 / 小技能 / 大招 的技能 id
export const HeroData = {
  hero_sword: {
    Name: "凌霄",
    Title: "剑仙",
    Modle: "hero_sword",
    Archetype: "blade",
    Hight: 262,
    Color: "#7fe8ff",
    Attr: { maxHp: 13200, atk: 450, def: 230, crit: 0.22, critDmg: 1.7, dodge: 0.06, interval: 1450 },
    Skills: { normal: 1001, skill: 1002, rage: 1003 },
  },
  hero_mage: {
    Name: "紫萱",
    Title: "灵符师",
    Modle: "hero_mage",
    Archetype: "caster",
    Hight: 250,
    Color: "#c99bff",
    Attr: { maxHp: 10700, atk: 380, def: 160, crit: 0.15, critDmg: 1.6, dodge: 0.08, interval: 1650 },
    Skills: { normal: 2001, skill: 2002, rage: 2003 },
  },
  hero_spear: {
    Name: "赵烈",
    Title: "破军",
    Modle: "hero_spear",
    Archetype: "spear",
    Hight: 270,
    Color: "#ff9a4a",
    Attr: { maxHp: 16500, atk: 345, def: 320, crit: 0.12, critDmg: 1.6, dodge: 0.04, interval: 1550 },
    Skills: { normal: 3001, skill: 3002, rage: 3003 },
  },
  enemy_demon: {
    Name: "赤炎魔将",
    Title: "魔将",
    Modle: "enemy_demon",
    Archetype: "blade",
    Hight: 290,
    Color: "#ff5a3a",
    Attr: { maxHp: 23500, atk: 385, def: 280, crit: 0.12, critDmg: 1.6, dodge: 0.03, interval: 1750 },
    Skills: { normal: 4001, skill: 4002, rage: 4003 },
  },
  enemy_fox: {
    Name: "九尾妖狐",
    Title: "妖狐",
    Modle: "enemy_fox",
    Archetype: "caster",
    Hight: 252,
    Color: "#6fd6ff",
    Attr: { maxHp: 14000, atk: 374, def: 170, crit: 0.18, critDmg: 1.6, dodge: 0.1, interval: 1650 },
    Skills: { normal: 5001, skill: 5002, rage: 5003 },
  },
  enemy_skeleton: {
    Name: "幽冥骨卒",
    Title: "骨卒",
    Modle: "enemy_skeleton",
    Archetype: "blade",
    Hight: 258,
    Color: "#8cff9a",
    Attr: { maxHp: 15400, atk: 321, def: 260, crit: 0.1, critDmg: 1.5, dodge: 0.05, interval: 1500 },
    Skills: { normal: 6001, skill: 6002, rage: 6003 },
  },
};

/** 阵型：x/y 为脚底坐标（敌方由 FightWorld 镜像） */
export const Formation = {
  hero: [
    { id: "hero_sword", x: 228, y: 830 },
    { id: "hero_mage", x: 92, y: 915 },
    { id: "hero_spear", x: 214, y: 1005 },
  ],
  enemy: [
    { id: "enemy_demon", x: 500, y: 880 },
    { id: "enemy_fox", x: 622, y: 800 },
    { id: "enemy_skeleton", x: 610, y: 985 },
  ],
};
