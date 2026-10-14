// Buff 配置（对应原游戏 Conf.BuffData）
//   Type: dot 持续伤害 / stun 控制（isUnable） / shield 护盾 / atkUp 攻击加成
//   Group + Priority：同组互斥，高优先级覆盖低优先级，同级刷新时长
export const BuffData = {
  burn: { Name: "灼烧", Type: "dot", Group: "dot", Priority: 1, Duration: 4000, Interval: 1000, Icon: "灼", Color: "#ff7a2f" },
  foxburn: { Name: "狐火", Type: "dot", Group: "dot", Priority: 2, Duration: 5000, Interval: 1000, Icon: "焰", Color: "#4fc8ff" },
  stun: { Name: "眩晕", Type: "stun", Group: "ctrl", Priority: 1, Duration: 1600, Icon: "晕", Color: "#ffd84a", Control: true },
  charm: { Name: "魅惑", Type: "stun", Group: "ctrl", Priority: 2, Duration: 2200, Icon: "魅", Color: "#ff7ad9", Control: true },
  shield: { Name: "护盾", Type: "shield", Group: "shield", Priority: 1, Duration: 6000, Icon: "盾", Color: "#ffd27a" },
  bone: { Name: "骨盾", Type: "shield", Group: "shield", Priority: 1, Duration: 6000, Icon: "骨", Color: "#c8ffd0" },
  rage: { Name: "狂怒", Type: "atkUp", Group: "atk", Priority: 1, Duration: 7000, Icon: "怒", Color: "#ff4a4a" },
};
