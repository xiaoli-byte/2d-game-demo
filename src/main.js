// 入口：加载资源 → 开始页 → 战斗循环
import { FightWorld } from "./fight/FightWorld.js";
import { FightConst } from "./config/FightConst.js";
import { Assets } from "./view/AssetLoader.js";
import { FightRender } from "./view/FightRender.js";
import { SoundMgr } from "./view/SoundMgr.js";
import { Hud } from "./ui/Hud.js";
import { LogPanel } from "./ui/LogPanel.js";

const $ = (id) => document.getElementById(id);
const SPEEDS = [1, 2, 0.5, 0.25];

const app = {
  assets: new Assets(),
  sound: new SoundMgr(),
  logPanel: new LogPanel(),
  render: null,
  hud: null,
  world: null,
  lastRecord: null,
  speedIdx: 0,
  autoRage: true,
  started: false,
};

// ------------------------------------------------------------ 舞台尺寸
function layout() {
  const stage = $("stage");
  const logW = app.logPanel.visible && window.innerWidth > 900 ? 396 : 0;
  const availW = window.innerWidth - logW - 24;
  const availH = window.innerHeight - 24;
  let h = availH;
  let w = (h * FightConst.STAGE_W) / FightConst.STAGE_H;
  if (w > availW) {
    w = availW;
    h = (w * FightConst.STAGE_H) / FightConst.STAGE_W;
  }
  // 手机竖屏：铺满
  if (window.innerWidth <= 600) {
    w = window.innerWidth;
    h = window.innerHeight;
  }
  stage.style.width = `${Math.floor(w)}px`;
  stage.style.height = `${Math.floor(h)}px`;
  document.documentElement.style.setProperty("--u", `${w / FightConst.STAGE_W}px`);
  if (app.render) app.render.resize();
}

// ------------------------------------------------------------ 战斗
function startBattle(replay = null) {
  if (app.world) app.world.bus.clear();
  const world = new FightWorld(replay ? { replay } : {});
  world.autoRage = app.autoRage;
  world.timeScale = SPEEDS[app.speedIdx];
  app.world = world;
  app.logPanel.clear();

  world.bus.on("log", (d) => app.logPanel.add(d));
  world.bus.on("fightStart", () => {
    app.hud.showFightBanner();
    app.sound.play("start");
  });
  // 定格时长是逻辑时间，演出动画要按当前倍速换算成真实时间
  world.bus.on("winup", (d) => app.hud.showCutin(d.caster, d.conf, d.time / world.timeScale));
  world.bus.on("end", (d) => {
    if (world.isLive) app.lastRecord = world.recordData;
    app.sound.play(d.result === "win" ? "win" : "lose");
    app.hud.showResult(d, world);
  });

  app.render.attach(world);
  app.hud.bind(world);
}

const handlers = {
  onSpeed() {
    app.speedIdx = (app.speedIdx + 1) % SPEEDS.length;
    const s = SPEEDS[app.speedIdx];
    if (app.world) app.world.timeScale = s;
    app.hud.setToggle("btn-speed", s !== 1, `${s}x`);
    app.sound.play("click");
  },
  onAuto() {
    app.autoRage = !app.autoRage;
    if (app.world) app.world.autoRage = app.autoRage;
    app.hud.setToggle("btn-auto", app.autoRage);
    app.hud.cards.forEach((c) => (c.state = "*"));
    app.sound.play("click");
  },
  onDebug() {
    app.render.showDebug = !app.render.showDebug;
    app.hud.setToggle("btn-debug", app.render.showDebug);
    app.sound.play("click");
  },
  onLog() {
    app.logPanel.setVisible(!app.logPanel.visible);
    app.hud.setToggle("btn-log", app.logPanel.visible);
    layout();
    app.sound.play("click");
  },
  onSound() {
    app.sound.setMuted(!app.sound.muted);
    app.hud.setToggle("btn-sound", !app.sound.muted);
  },
  onPause() {
    if (!app.world) return;
    app.world.paused = !app.world.paused;
    app.hud.setToggle("btn-pause", app.world.paused, app.world.paused ? "继续" : "暂停");
    app.hud.setPaused(app.world.paused);
    app.sound.play("click");
  },
  onRage(id) {
    if (!app.world || !app.world.isLive) return;
    app.world.requestRage(id);
    app.sound.play("click");
  },
  onReplay() {
    if (!app.lastRecord) return;
    app.sound.play("click");
    resetPause();
    startBattle(app.lastRecord);
  },
  onAgain() {
    app.sound.play("click");
    resetPause();
    startBattle();
  },
};

function resetPause() {
  app.hud.setToggle("btn-pause", false, "暂停");
}

// ------------------------------------------------------------ 主循环
let last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  const w = app.world;
  if (w && app.started) {
    w.update(dt);
    const viewDt = w.paused ? 0 : dt * w.timeScale;
    app.render.update(viewDt);
    app.hud.update();
  } else if (app.render) {
    app.render.update(dt);
  }
  if (app.render) app.render.render();
  app.logPanel.flush();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ 启动
async function boot() {
  layout();
  window.addEventListener("resize", layout);
  const fill = $("start-progress-fill");
  await app.assets.load((p) => (fill.style.transform = `scaleX(${p})`));
  // 等字体就绪，避免飘字第一次绘制时字体闪烁
  try {
    await Promise.race([
      Promise.all([document.fonts.load('48px "ZCOOL QingKe HuangYou"'), document.fonts.load('48px "Ma Shan Zheng"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* 字体加载失败时使用系统字体 */
  }
  app.render = new FightRender($("fight-canvas"), app.assets, app.sound);
  app.hud = new Hud(app.assets, handlers);
  layout();
  // 开始页背后先摆好阵型
  startBattle();
  app.world.paused = true;
  $("start-tip").textContent = "";
  $("start-progress").classList.add("hidden");
  $("btn-start").classList.remove("hidden");
  $("btn-start").onclick = () => {
    app.sound.unlock();
    app.sound.play("click");
    $("start").classList.add("leaving");
    setTimeout(() => $("start").classList.add("hidden"), 500);
    app.hud.show();
    app.started = true;
    app.sound.startMusic();
    startBattle();
  };
  requestAnimationFrame(frame);
}

boot();

// 方便在控制台调试
window.__demo = app;
