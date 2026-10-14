// 可设种子的随机数（mulberry32）。
// 原游戏战斗用的是 Math.random，服务器无法逐帧复算，只能做统计校验；
// 这里改成带种子的随机，同一个种子能完整复现一场战斗，方便测试和调试。
export class Random {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed >>> 0;
    this._s = this.seed;
  }

  next() {
    let t = (this._s = (this._s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
}
