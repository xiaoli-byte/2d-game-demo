// 战斗流水日志面板：按分类着色、可过滤，每帧批量写入 DOM
const CATS = {
  ai: { name: "AI", color: "#8fd3ff" },
  state: { name: "状态", color: "#c8b6ff" },
  anim: { name: "动画", color: "#7a8a99" },
  event: { name: "帧事件", color: "#ffd166" },
  dmg: { name: "伤害", color: "#ff8a7a" },
  buff: { name: "Buff", color: "#7dffb0" },
  rec: { name: "战报", color: "#f1cf86" },
};
const MAX_LINES = 500;

export class LogPanel {
  constructor() {
    this.panel = document.getElementById("log-panel");
    this.list = document.getElementById("log-list");
    this.enabled = { ai: true, state: true, anim: false, event: true, dmg: true, buff: true, rec: true };
    this.pending = [];
    const filters = document.getElementById("log-filters");
    for (const [k, c] of Object.entries(CATS)) {
      const b = document.createElement("button");
      b.textContent = c.name;
      b.style.setProperty("--c", c.color);
      b.classList.toggle("on", this.enabled[k]);
      b.onclick = () => {
        this.enabled[k] = !this.enabled[k];
        b.classList.toggle("on", this.enabled[k]);
      };
      filters.appendChild(b);
    }
  }

  get visible() {
    return !this.panel.classList.contains("hidden");
  }

  setVisible(v) {
    this.panel.classList.toggle("hidden", !v);
  }

  clear() {
    this.list.innerHTML = "";
    this.pending = [];
  }

  add({ cat, text, t }) {
    if (!this.visible || !this.enabled[cat]) return;
    this.pending.push({ cat, text, t });
  }

  flush() {
    if (!this.pending.length) return;
    const atBottom = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 30;
    const frag = document.createDocumentFragment();
    for (const p of this.pending) {
      const row = document.createElement("div");
      const time = document.createElement("time");
      time.textContent = (p.t / 1000).toFixed(2);
      const span = document.createElement("span");
      span.style.setProperty("--c", CATS[p.cat].color);
      span.textContent = p.text;
      row.append(time, span);
      frag.appendChild(row);
    }
    this.pending = [];
    this.list.appendChild(frag);
    while (this.list.childElementCount > MAX_LINES) this.list.firstElementChild.remove();
    if (atBottom) this.list.scrollTop = this.list.scrollHeight;
  }
}
