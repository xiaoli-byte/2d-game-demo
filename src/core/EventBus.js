// 全局消息总线（对应原架构中的 MessageCenter）
// 战斗逻辑只通过总线通知表现层（特效、飘字、震屏、音效、日志），自身不接触 DOM/Canvas，
// 因此可以在 Node 里无头运行做测试。
export class EventBus {
  constructor() {
    this._map = new Map();
  }

  on(type, fn, ctx) {
    if (!this._map.has(type)) this._map.set(type, []);
    this._map.get(type).push({ fn, ctx });
    return () => this.off(type, fn, ctx);
  }

  off(type, fn, ctx) {
    const list = this._map.get(type);
    if (!list) return;
    const i = list.findIndex((l) => l.fn === fn && l.ctx === ctx);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, data) {
    const list = this._map.get(type);
    if (!list) return;
    for (const l of list.slice()) l.fn.call(l.ctx, data);
  }

  clear() {
    this._map.clear();
  }
}
