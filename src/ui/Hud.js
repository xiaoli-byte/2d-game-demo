// 战斗界面（DOM 层）：顶栏、英雄卡牌、开战横幅、大招演出、结算
import { FightConst } from "../config/FightConst.js";
import { HeroSkillData } from "../config/SkillData.js";

const $ = (id) => document.getElementById(id);

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function portraitNode(assets, model) {
  const src = assets.portraits.get(model);
  if (!src) return document.createElement("div");
  if (src instanceof HTMLImageElement) {
    const img = new Image();
    img.src = src.src;
    img.alt = "";
    return img;
  }
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

export class Hud {
  constructor(assets, handlers) {
    this.assets = assets;
    this.h = handlers;
    this.world = null;
    this.cards = [];
    this._resultTimer = 0;
    $("btn-speed").onclick = () => this.h.onSpeed();
    $("btn-auto").onclick = () => this.h.onAuto();
    $("btn-debug").onclick = () => this.h.onDebug();
    $("btn-log").onclick = () => this.h.onLog();
    $("btn-sound").onclick = () => this.h.onSound();
    $("btn-pause").onclick = () => this.h.onPause();
    $("btn-replay").onclick = () => this.h.onReplay();
    $("btn-again").onclick = () => this.h.onAgain();
  }

  show() {
    $("hud").classList.remove("hidden");
  }

  setToggle(id, on, text) {
    const b = $(id);
    b.classList.toggle("on", !!on);
    if (text) b.textContent = text;
  }

  bind(world) {
    this.world = world;
    clearTimeout(this._resultTimer);
    $("result").classList.add("hidden");
    $("replay-badge").classList.toggle("hidden", world.isLive);
    $("pause-mask").classList.add("hidden");
    this.buildCards(world.entityMgr.of("hero"));
    this.update();
  }

  buildCards(heroes) {
    const root = $("hero-cards");
    root.innerHTML = "";
    this.cards = heroes.map((e) => {
      const el = document.createElement("div");
      el.className = "card";
      el.style.setProperty("--card-color", e.conf.Color);
      const rage = HeroSkillData[e.conf.Skills.rage];
      el.innerHTML = `
        <div class="card-portrait"><div class="card-rage-ring"></div></div>
        <div class="card-info">
          <div class="card-name">${e.name}<small>${e.conf.Title}</small></div>
          <div class="bar"><i class="lag"></i><i class="hp"></i></div>
          <div class="bar rage"><i class="rg"></i></div>
          <div class="card-hint">大招·${rage.Name}</div>
        </div>`;
      el.querySelector(".card-portrait").prepend(portraitNode(this.assets, e.conf.Modle));
      el.onclick = () => this.h.onRage(e.id);
      root.appendChild(el);
      return {
        e,
        el,
        hp: el.querySelector(".hp"),
        lag: el.querySelector(".lag"),
        rg: el.querySelector(".rg"),
        ring: el.querySelector(".card-rage-ring"),
        hint: el.querySelector(".card-hint"),
        rageName: rage.Name,
        state: "",
      };
    });
  }

  update() {
    const w = this.world;
    if (!w) return;
    const left = FightConst.FIGHT_TIME - w.fightTime;
    const t = $("timer-text");
    t.textContent = fmtTime(left);
    t.parentElement.classList.toggle("urgent", w.fighting && left < 15000);

    const enemies = w.entityMgr.of("enemy");
    const max = enemies.reduce((s, e) => s + e.attr.maxHp, 0);
    const cur = enemies.reduce((s, e) => s + e.hp, 0);
    const k = (cur / max).toFixed(4);
    $("enemy-total-fill").style.transform = `scaleX(${k})`;
    $("enemy-total-lag").style.transform = `scaleX(${k})`;

    for (const c of this.cards) {
      const e = c.e;
      const hpK = (e.hp / e.attr.maxHp).toFixed(4);
      c.hp.style.transform = `scaleX(${hpK})`;
      c.lag.style.transform = `scaleX(${hpK})`;
      const rk = e.rage / FightConst.MAX_RAGE;
      c.rg.style.transform = `scaleX(${rk.toFixed(3)})`;
      c.ring.style.setProperty("--rage", (rk * 100).toFixed(1));
      const dead = e.hp <= 0;
      const ready = !dead && rk >= 1 && w.isLive && !w.ended;
      const state = dead ? "dead" : ready ? "ready" : "";
      if (state !== c.state) {
        c.state = state;
        c.el.classList.toggle("dead", dead);
        c.el.classList.toggle("ready", ready);
        c.hint.textContent = dead ? "已阵亡" : ready ? (w.autoRage ? `即将释放·${c.rageName}` : `点击释放·${c.rageName}`) : `大招·${c.rageName}`;
      }
    }
  }

  setPaused(p) {
    $("pause-mask").classList.toggle("hidden", !p);
  }

  showFightBanner() {
    const b = $("fight-banner");
    b.classList.remove("show");
    void b.offsetWidth;
    b.classList.add("show");
  }

  showCutin(caster, conf, time) {
    const root = $("cutin");
    root.style.setProperty("--cutin-color", caster.conf.Color);
    root.style.setProperty("--cutin-time", `${time}ms`);
    const src = this.assets.portraits.get(caster.conf.Modle);
    const img = $("cutin-portrait");
    if (src instanceof HTMLImageElement) img.src = src.src;
    else if (src) img.src = src.toDataURL();
    img.style.display = src ? "" : "none";
    // 敌方从右往左
    root.style.transform = caster.side === "enemy" ? "scaleX(-1)" : "";
    root.querySelector(".cutin-text").style.transform = caster.side === "enemy" ? "skewY(8deg) scaleX(-1)" : "";
    img.style.transform = caster.side === "enemy" ? "skewY(8deg) scaleX(-1)" : "";
    $("cutin-hero").textContent = `${caster.conf.Title} · ${caster.name}`;
    $("cutin-skill").textContent = conf.Show.cutin || conf.Name;
    root.classList.remove("show");
    void root.offsetWidth;
    root.classList.add("show");
  }

  showResult({ result, reason, payload }, world, delay = 1600) {
    clearTimeout(this._resultTimer);
    this._resultTimer = setTimeout(() => {
      const win = result === "win";
      const title = $("result-title");
      title.textContent = win ? "胜 利" : "败 北";
      title.classList.toggle("lose", !win);
      const sec = (world.fightTime / 1000).toFixed(1);
      $("result-sub").textContent = `${world.isLive ? "" : "【战报回放】"}${reason === "timeout" ? "战斗超时" : win ? "敌方全灭" : "我方全灭"} · 用时 ${sec} 秒`;

      const heroes = world.entityMgr.of("hero");
      const maxV = Math.max(1, ...heroes.map((e) => Math.max(e.stats.damage, e.stats.heal)));
      const mvp = heroes.reduce((a, b) => (b.stats.damage + b.stats.heal * 0.8 > a.stats.damage + a.stats.heal * 0.8 ? b : a));
      const box = $("result-stats");
      box.innerHTML = "";
      for (const e of heroes) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.innerHTML = `
          <div class="stat-avatar">${e === mvp ? '<span class="stat-mvp">MVP</span>' : ""}</div>
          <div>
            <div class="stat-name">${e.name}</div>
            <div class="stat-line">输出<div class="bar"><i></i></div><b>${Math.round(e.stats.damage)}</b></div>
            ${e.stats.heal > 0 ? `<div class="stat-line">治疗<div class="bar heal"><i></i></div><b>${Math.round(e.stats.heal)}</b></div>` : ""}
          </div>`;
        row.querySelector(".stat-avatar").prepend(portraitNode(this.assets, e.conf.Modle));
        box.appendChild(row);
        const bars = row.querySelectorAll(".bar i");
        requestAnimationFrame(() => {
          bars[0].style.transform = `scaleX(${e.stats.damage / maxV})`;
          if (bars[1]) bars[1].style.transform = `scaleX(${e.stats.heal / maxV})`;
        });
      }
      $("result-payload").textContent = JSON.stringify(payload, null, 2);
      $("btn-replay").textContent = world.isLive ? "回放战报" : "再看一遍";
      $("result").classList.remove("hidden");
    }, delay);
  }
}
