"""用 OpenAI 图像接口生成战斗 demo 的替代素材（原创，不使用官方资源）。

用法:
    python gen_assets.py            # 生成清单里所有缺失的素材
    python gen_assets.py hero_sword # 只生成指定 id（可多个）
    python gen_assets.py --force x  # 强制重新生成

需要环境变量 OPENAI_API_KEY。输出到 ../assets/。
"""
import base64
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from openai import OpenAI

OUT = Path(__file__).resolve().parent.parent / "assets"
MODEL = "gpt-image-1"

STYLE = (
    "2D mobile xianxia fantasy RPG game asset, polished hand-painted anime style, "
    "clean crisp edges, vibrant colors, soft cel shading, no text, no watermark, no frame, no ground shadow"
)
CHAR = (
    "single full-body character, side view facing RIGHT, standing combat-ready idle pose, "
    "whole body visible with feet included, centered, isolated on a fully transparent background"
)
FX = "single isolated visual effect sprite, centered, on a fully transparent background, glowing additive-light look"

ASSETS = {
    # ---- 我方角色 ----
    "hero_sword": ("1024x1024", True, f"{STYLE}. {CHAR}. A young male sword immortal in flowing white and azure robes, long black hair tied up, holding a glowing jade-blue longsword."),
    "hero_mage": ("1024x1024", True, f"{STYLE}. {CHAR}. A female taoist sorceress in violet and gold robes with floating ribbons, holding a talisman scroll, purple arcane glow around her hand."),
    "hero_spear": ("1024x1024", True, f"{STYLE}. {CHAR}. A heavily armored male spear general in crimson and bronze armor with a red cape, holding a long flame-tipped spear."),
    # ---- 敌方角色 ----
    "enemy_demon": ("1024x1024", True, f"{STYLE}. {CHAR}. A hulking horned demon warrior with dark red skin and black spiked armor, holding a huge jagged cleaver."),
    "enemy_fox": ("1024x1024", True, f"{STYLE}. {CHAR}. A sly nine-tailed fox spirit enchantress in dark pink robes, fox ears, holding a ball of ghostly blue foxfire."),
    "enemy_skeleton": ("1024x1024", True, f"{STYLE}. {CHAR}. An undead skeleton soldier in rusty ancient chinese armor holding a cracked sabre, green ghost flames in its eye sockets."),
    # ---- 技能 / 受击特效 ----
    "fx_slash": ("1024x1024", True, f"{STYLE}. {FX}. A wide crescent sword slash arc of bright cyan-white energy, motion streaks, sweeping from upper left to lower right."),
    "fx_fireball": ("1024x1024", True, f"{STYLE}. {FX}. A flying fireball projectile moving to the right, bright yellow-orange core with a flame trail streaming to the left."),
    "fx_explosion": ("1024x1024", True, f"{STYLE}. {FX}. A round fiery explosion burst with orange flames, sparks and smoke puffs, radial."),
    "fx_hit": ("1024x1024", True, f"{STYLE}. {FX}. An impact hit spark: sharp white-yellow star-shaped flash with radial spikes and small sparks, radial."),
    "fx_lightning": ("1024x1024", True, f"{STYLE}. {FX}. A vertical purple-white lightning bolt striking down from the top edge to the bottom, with branching forks."),
    "fx_heal": ("1024x1024", True, f"{STYLE}. {FX}. A soft green healing aura ring seen in perspective, rising light particles and small leaf-shaped sparkles."),
    "fx_shield": ("1024x1024", True, f"{STYLE}. {FX}. A translucent golden hexagon-pattern energy shield bubble, round, semi-transparent center."),
    "fx_foxfire": ("1024x1024", True, f"{STYLE}. {FX}. A ghostly blue foxfire orb projectile moving to the right, wispy cyan flame trail to the left."),
    "fx_stun": ("1024x1024", True, f"{STYLE}. {FX}. A small ring of spinning yellow dizzy stars, top-down perspective ellipse, cartoon stun indicator."),
    # ---- 场景 ----
    "bg_battle": ("1024x1536", False, f"{STYLE}. Vertical mobile battle background, no characters: a misty ancient mountain temple courtyard at dusk, stone floor occupying the lower two thirds as an open arena, distant floating peaks and pagodas, warm and purple sky."),
}


def generate(client: OpenAI, key: str, force: bool) -> str:
    size, transparent, prompt = ASSETS[key]
    target = OUT / f"{key}.png"
    if target.exists() and not force:
        return f"skip   {key}"
    kwargs = dict(model=MODEL, prompt=prompt, size=size, quality="medium", n=1)
    if transparent:
        kwargs["background"] = "transparent"
    res = client.images.generate(**kwargs)
    target.write_bytes(base64.b64decode(res.data[0].b64_json))
    return f"ok     {key} -> {target.name}"


def main() -> None:
    args = sys.argv[1:]
    force = "--force" in args
    keys = [a for a in args if not a.startswith("--")] or list(ASSETS)
    unknown = [k for k in keys if k not in ASSETS]
    if unknown:
        sys.exit("未知素材 id: " + ", ".join(unknown))
    OUT.mkdir(parents=True, exist_ok=True)
    client = OpenAI()
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(generate, client, k, force): k for k in keys}
        for f, k in futures.items():
            try:
                print(f.result(), flush=True)
            except Exception as e:  # 单个失败不影响其他
                print(f"FAIL   {k}: {e}", flush=True)


if __name__ == "__main__":
    main()
