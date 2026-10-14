// 震屏参数表（对应原游戏 FightCamera 读取的 ShakeInfo）
// type 0..3 依次增强；每一档由若干段位移组成：amp 振幅，angle 方向，time 单段时长(ms)
export const ShakeInfo = [
  { amp: [3, 5], angle: [45, 255], time: [30, 40], playTime: 260 },
  { amp: [6, 9, 5], angle: [90, 270, 60], time: [28, 34, 40], playTime: 380 },
  { amp: [10, 14, 9, 6], angle: [80, 260, 120, 300], time: [26, 30, 34, 40], playTime: 560 },
  { amp: [16, 20, 14, 10, 6], angle: [90, 270, 45, 225, 135], time: [24, 28, 30, 34, 40], playTime: 820 },
];
