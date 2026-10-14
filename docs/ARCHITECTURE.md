# 战斗系统架构说明

这个 Demo 复刻的是一类商业 Egret 卡牌 RPG 小游戏的即时战斗架构。参考来源只有设计思路：组件化实体、帧事件驱动技能、战报录制与回放、表现配置与逻辑配置分离。代码全部重写，美术全部为 AI 原创生成，没有使用原游戏的任何代码或资源。

下文的类名基本沿用原架构的命名，方便对照学习。

## 1. 分层

```
┌──────────────── 表现层（只读逻辑状态，订阅总线） ────────────────┐
│ FightRender  角色绘制、血条、地面光圈、大招压暗                  │
│ EffectMgr    特效 JSON / 程序特效 / 弹道表现 / 粒子              │
│ FightFloatView 伤害飘字    FightCamera 震屏、推镜、冲击缩放      │
│ SoundMgr     WebAudio 程序化音效    Hud / LogPanel  DOM 界面     │
└───────────────────────────▲─────────────────────────────────────┘
                            │ EventBus：fx / hp / shake / winup / sfx / buff / log / end
┌───────────────────────────┴───── 逻辑层（可在 Node 中无头运行） ─┐
│ FightWorld   固定步长推进、定格、血量入口、结算、弹道           │
│ EntityMgr → Entity                                               │
│   BuffComponent → AIComponent → MoveComponent                    │
│   → DBTimerComponent(帧事件) → StateMachineComponent             │
│   SkillComponent（被帧事件驱动）                                 │
│ FightRecord（录战报）  FightCommand（回放战报）  Formula         │
└───────────────────────────▲─────────────────────────────────────┘
                            │ 只读
┌───────────────────────────┴───── 配置层 ─────────────────────────┐
│ HeroData  SkillData（逻辑字段 + Show 表现字段）  BuffData        │
│ ActionConfig（动作时长 + 帧事件 + 关键帧）  ShakeInfo FightConst │
└─────────────────────────────────────────────────────────────────┘
```

逻辑层不接触任何 DOM 或 Canvas，`tests/` 下的测试直接在 Node 里跑完整场战斗。

## 2. 一次攻击从出手到受击

以剑仙普攻"流云剑"为例：

1. **AIComponent.tick**：站立且未被控时，按 大招（怒气满）> 小技能（CD 好）> 普攻（攻击间隔到）选技能，`selectTargets` 选出最近的敌人。
2. **SkillComponent.prepare**：目标在 `ReleaseScope` 之外时，先 `MoveComponent.chase` 追击。追击过程中每帧按目标当前位置修正终点，进入距离后回调。
3. **SkillComponent.runSkill**：
   - 写战报 `[SKILL, 施法者, 技能, 目标]`
   - 加怒气
   - 播 `Show.attack` 施法特效
   - 按技能类型切状态（普攻 8 / 技能 9 / 大招 10）
4. **StateMachineComponent** 进入攻击状态，**DBTimerComponent.play("singleattack")**。
5. **DBTimerComponent.tick** 按 30fps 推进。第 10 帧到达时触发帧事件 `hit1`，调用 `SkillComponent.onActionEvent("hit1")`。
6. **onHitPointEvents(1)** 取 `HitEff[0] = [[DAMAGE, 1.0], [HITBACK, 0]]`：
   - 技能有 `bullet` 配置时，先发射弹道，到达时再结算。
   - 否则立即对每个目标调用 `dealHit`。
7. **dealHit**：
   - `Formula.calcDamage` 算出伤害（闪避、暴击、防御减伤），交给 `FightWorld.applyHp`。
   - `applyHp` 依次处理：护盾吸收、写战报 `[HP, ...]`、通知表现层、目标在站立时切到受击状态、暴击时顿帧 70ms。
   - 然后处理击退（`Entity.hitBack`）、击飞（`StateHitFly`）、震屏（`shake`）、受击特效（`Show.hurt`）、音效。
   - 首段命中时附加 Buff（`addSkillBuff`）。
8. 动作播完，**StateMachineComponent.onActionComplete** → **SkillComponent.onActionComplete** → 回到站立，等待 AI 下一次出手。

**关键点**：伤害发生的时机完全由动作配置里的帧事件决定，而不是由技能逻辑里写死的延迟决定。美术调动作节奏时只改动作数据，逻辑自动跟上。

## 3. 动作配置 = 动画元数据

`src/config/ActionConfig.js` 对应原游戏从龙骨文件预导出的 `dbSke_json`：

```js
singleattack: {
  frames: 22,                                // 动作总帧数（30fps）
  events: [{ name: "hit1", frame: 10 }],     // 帧事件
  smear: [8, 13],                            // 残影帧区间（表现层）
  keys: [                                    // 关键帧（表现层）
    k(0, "idle"),
    k(6, "idle",   { x: -18, rot: -7, sx: 0.94, sy: 1.06, ease: "sineOut" }), // 蓄力
    k(9, "attack", { x: 30,  rot: 4,  sx: 1.1,  sy: 0.93, ease: "expoOut" }), // 出招
    k(22, "idle",  { ease: "sineInOut" }),
  ],
}
```

逻辑层只读 `frames` 和 `events`，表现层只读 `keys` 和 `smear`。

帧事件命名沿用原架构：

| 事件 | 作用 |
|---|---|
| `hit1..N` | 第 N 个命中点，对应技能配置 `HitEff[N-1]` |
| `shake1` | 大招前摇定格（全场停顿，表现层播放大招演出） |

## 4. 状态机

编号与原游戏 `EntityFSM` 一致：

| 编号 | 状态 | 动作 |
|---|---|---|
| 1 | 站立 | `loading` |
| 2 | 移动 | `run` |
| 3 | 受击 | `behit` |
| 4 | 击飞 | `float_behit` → 落地 `up1` |
| 8 | 普攻 | `singleattack` |
| 9 | 技能 | `attack` |
| 10 | 大招 | `bigskill` |
| 11 | 死亡 | `dead` |
| 15 | 胜利 | `win` |

切换受白名单约束：
- 站立、受击可以切到任意状态。
- 击飞只能切到击飞或死亡。
- 死亡是终态。

受击动作只在站立时播放，攻击中被打只闪白，不会打断出招。被控（眩晕、魅惑）没有单独状态，而是由 Buff 让 AI 停止出手，与原游戏 `isUnable` 的做法一致。

## 5. 战报：录制与回放

实时模式下，`FightWorld.record` 把关键动作按逻辑帧号记成 `{ t, a: [[类型, ...参数]] }`：

| 类型 | 参数 |
|---|---|
| SKILL | 施法者, 技能, 目标列表 |
| HP | 目标, 变化量, 标记(普通/暴击/治疗/持续/闪避), 护盾吸收, 来源 |
| BUFF | 目标, buffId, 加/移除, 数值, 来源 |
| RAGE | 实体, 怒气值 |
| MOVE | 实体, x, y, 追击目标, 距离 |
| END | 结果, 原因 |

回放模式（`FightCommand`）的规则：
- 不跑 AI，不算伤害，不掷随机数。
- 技能和移动照常交给组件表现，动作、特效、弹道、震屏都会正常播放。
- 血量、Buff、怒气直接按战报设置。

这对应原游戏 PVP 的做法：服务器跑出战报下发，客户端只负责播放。

逻辑固定步长推进，倍速只改变每帧推进的步数，所以：
- 同一个种子的两场战斗逐帧一致。
- 回放的最终状态与实时战斗完全一致（`tests/fight.test.mjs` 覆盖了这两点）。

结算时生成的上报数据仿照原游戏协议 102：`result`、`battle_time`、`total_hurt`、`stateinfo`、`checkdata`。其中 `checkdata` 包含战报统计和校验和。

## 6. 表现细节

| 效果 | 实现 |
|---|---|
| 关键姿势 + 补间 | 每个角色有 待机/出招/蓄力/受击 4 张关键姿势图。按关键帧切换姿势图（阶跃），位移、旋转、挤压拉伸按缓动插值 |
| 脚底锚点 | 加载时按图片底部不透明像素算出脚底中心，切换姿势时人物不左右跳 |
| 残影 | `smear` 区间内每 30ms 记录一次变换，用角色色剪影叠加绘制并淡出 |
| 蓄力光 | 关键帧 `glow` 值控制模糊剪影的叠加亮度 |
| 受击闪白 | 白色剪影叠加，140ms 衰减 |
| 顿帧 | 暴击时全场定格 70ms，配合镜头冲击缩放 |
| 大招演出 | `shake1` 定格 1.1 秒。期间全场压暗、施法者提亮、镜头推近，斜切横幅带半身像和技能名 |
| 飘字 | 按原游戏曲线：普通 0.8→1.05→0.9 上飘；暴击 1.4→1.05→1.1→1 弹跳。同一目标的飘字排队，间隔 100ms |
| 震屏 | `ShakeInfo` 分段振幅、角度、时长，只会被更强的档位覆盖 |
| 屏幕适配 | fixedWidth：宽度固定 720，高度随屏幕延伸，多出的部分用背景补满 |
| 特效换色 | 一张特效图通过 `color` 混合模式换色复用（魔将的赤红剑气、骨卒的幽绿剑气都来自同一张剑气图） |
