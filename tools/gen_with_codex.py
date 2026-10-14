"""用本机 codex CLI 的内置图像生成批量出 demo 素材（全部原创，不使用官方资源）。

流程：
  1. 先生成每个角色的待机图（loading），以及特效、背景
  2. 再以待机图为参考（codex exec -i）生成同一角色的其他姿势，保证造型一致
  3. 每张原图存 assets/raw/，再用 postprocess.py 抠图/转透明 存到 assets/

用法:
    python gen_with_codex.py              # 生成所有缺失素材
    python gen_with_codex.py hero_mage_idle fx_slash   # 只生成指定的
    python gen_with_codex.py --force xxx  # 强制重做
"""
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "assets"
MODEL = "gpt-5.6-sol"
# 必须串行：多个 codex 并行时会从共享的图片输出目录里拿错别人的图
WORKERS = 1

def _codex_cmd():
    """Windows 上 codex 是 codex.cmd 批处理，cmd.exe 会在参数的换行处截断提示词。
    所以直接用 node 调 codex.js，绕过批处理。"""
    exe = shutil.which("codex")
    if exe and exe.lower().endswith(".cmd"):
        js = Path(exe).parent / "node_modules" / "@openai" / "codex" / "bin" / "codex.js"
        if js.exists():
            return [shutil.which("node") or "node", str(js)]
    return [exe or "codex"]


CODEX = _codex_cmd()

STYLE = (
    "Chinese xianxia mobile RPG game CG art, premium semi-realistic anime rendering with glossy painterly finish, "
    "highly detailed costume with ornate gold filigree and jewelry, dramatic rim lighting, rich saturated colors, "
    "crisp clean edges, no text, no watermark, no border"
)
CHAR_BG = ("IMPORTANT: the background MUST be one flat solid pure magenta color (#FF00FF) filling the entire image edge to edge, "
          "no dark background, no gradient, no vignette, no glow behind the figure, no floor, no shadow")
CHAR_FRAME = "single full-body character, side view facing RIGHT, whole body including feet visible, centered, generous empty margin around the figure"
FX_BG = "pure solid black background (#000000) filling the whole image, the effect itself is bright glowing light"

CHARS = {
    "hero_sword": "a young male sword immortal in flowing white and azure robes, long black hair tied up in a high ponytail, wielding a glowing jade-blue longsword",
    "hero_mage": "a young female taoist sorceress in violet and gold layered robes with floating silk ribbons, hair in an elegant bun with a gold hairpin, holding a glowing paper talisman",
    "hero_spear": "a heavily armored male spear general in crimson and bronze armor with a red cape and plumed helmet, wielding a long flame-tipped spear",
    "enemy_demon": "a hulking horned demon warrior with dark red skin and black spiked armor, glowing yellow eyes, wielding a huge jagged cleaver",
    "enemy_fox": "a sly nine-tailed fox spirit enchantress in dark pink and black robes, white fox ears, nine fluffy white tails, ghostly blue foxfire floating at her hand",
    "enemy_skeleton": "an undead skeleton soldier in rusty ancient chinese lamellar armor with a torn red sash, green ghost flames in its eye sockets, wielding a cracked sabre",
}

POSES = {
    "idle": "combat-ready idle standing pose, weapon held ready",
    "attack": "mid-strike basic attack pose: lunging forward and swinging the weapon in a powerful forward slash, dynamic motion",
    "skill": "dramatic ultimate-skill casting pose: weapon raised high overhead, body gathering glowing energy aura, hair and clothes blowing upward",
    "hit": "getting hit pose: recoiling backward off-balance, flinching with eyes squeezed shut, arms thrown back, body leaning away to the left",
}
# 半身像（卡牌头像、大招演出用）
PORTRAIT = (
    "Draw the SAME character with the identical face, hairstyle, outfit and colors, as a dramatic "
    "head-and-shoulders bust portrait in three-quarter view facing right, confident expression, "
    "the head fills the upper middle of the frame, cropped at the chest"
)
CHAR_POSES = {
    "hero_sword": ["idle", "attack", "skill", "hit"],
    "hero_mage": ["idle", "attack", "skill", "hit"],
    "hero_spear": ["idle", "attack", "skill", "hit"],
    "enemy_demon": ["idle", "attack", "hit"],
    "enemy_fox": ["idle", "attack", "hit"],
    "enemy_skeleton": ["idle", "attack", "hit"],
}

FX = {
    "fx_slash": "a wide crescent-shaped sword slash arc of bright cyan-white energy with motion streaks, sweeping from upper left to lower right",
    "fx_fireball": "a single flying fireball projectile heading to the right, bright yellow-orange core with a long flame trail streaming to the left",
    "fx_foxfire": "a single ghostly blue foxfire orb projectile heading to the right, wispy cyan flame trail streaming to the left",
    "fx_explosion": "a round fiery explosion burst with orange flames, sparks and ember particles, radial, viewed from the side",
    "fx_hit": "an impact hit spark: sharp white-yellow star-shaped flash with radial light spikes and small sparks",
    "fx_lightning": "one vertical purple-white lightning bolt striking straight down from the top edge to the bottom edge, with small branching forks",
    "fx_heal": "a soft green healing light column with rising sparkles and small glowing leaf particles",
    "fx_shield": "a round translucent golden energy shield bubble with faint hexagon pattern, bright rim, mostly see-through center",
    "fx_sword": "a single glowing spectral flying sword pointing straight down, cyan-white light blade with a light trail above it",
    "fx_stun": "a small ring of spinning yellow cartoon stars in an ellipse, stun indicator",
}

BG = {
    "bg_battle": "vertical portrait mobile game battle background, absolutely no characters: an ancient mountaintop temple courtyard at dusk, a wide flat stone-tiled arena floor filling the lower 60 percent of the image, carved stone railings at the sides, distant floating peaks, pagodas and waterfalls under a warm orange and purple sky with clouds",
}


def jobs():
    """返回 (name, phase, prompt, reference, kind)"""
    out = []
    for cid, desc in CHARS.items():
        for pose in CHAR_POSES[cid]:
            name = f"{cid}_{pose}"
            if pose == "idle":
                prompt = f"{STYLE}. {CHAR_FRAME}. The character: {desc}. Pose: {POSES[pose]}. {CHAR_BG}."
                out.append((name, 1, prompt, None, "char"))
            else:
                prompt = (
                    f"{STYLE}. The attached image is the reference design of this exact character. "
                    f"Draw the SAME character with the identical face, hairstyle, outfit, colors and weapon, "
                    f"same art style and same scale, in a new pose. {CHAR_FRAME}. Pose: {POSES[pose]}. {CHAR_BG}."
                )
                out.append((name, 2, prompt, RAW / f"{cid}_idle.png", "char"))
        prompt = f"{STYLE}. The attached image is the reference design of this exact character. {PORTRAIT}. {CHAR_BG}."
        out.append((f"{cid}_portrait", 2, prompt, RAW / f"{cid}_idle.png", "portrait"))
    for name, desc in FX.items():
        out.append((name, 1, f"{STYLE}. Single isolated visual effect sprite, centered: {desc}. {FX_BG}.", None, "fx"))
    for name, desc in BG.items():
        out.append((name, 1, f"{STYLE}. {desc}. Fill the entire canvas edge to edge.", None, "bg"))
    return out


def run_codex(name, prompt, reference):
    target = RAW / f"{name}.png"
    instruction = (
        "Call your built-in image generation tool exactly once, passing the IMAGE PROMPT below verbatim "
        "(do not rewrite, shorten or reinterpret it). "
        + ("Use the attached image as the visual reference for the character. " if reference else "")
        + f"Then save the image produced by THAT call into the current working directory with the exact filename {target.name}. "
        "Use the file path returned by that tool call in this session; never copy any older or unrelated image. "
        "Do not create any other files. When done, print only the absolute path of the saved file.\n\n"
        "IMAGE PROMPT:\n" + prompt
    )
    cmd = [*CODEX, "exec", "-m", MODEL, "--skip-git-repo-check", "-s", "workspace-write", "-C", str(RAW)]
    if reference:
        # -i 可接收多个文件，必须用 -- 结束，否则提示词会被当成图片路径
        cmd += ["-i", str(reference), "--"]
    cmd.append(instruction)
    for attempt in range(2):
        started = time.time()
        subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=900, shell=False)
        # 必须是本次运行之后新写入的文件，防止拿到旧图
        if target.exists() and target.stat().st_size > 10_000 and target.stat().st_mtime >= started - 1:
            return True
        time.sleep(3)
    return False


def process(name, kind):
    subprocess.run([sys.executable, str(ROOT / "tools" / "postprocess.py"), str(RAW / f"{name}.png"),
                    str(OUT / f"{name}.png"), kind], check=True, stdout=subprocess.DEVNULL)


def work(job, force):
    name, _, prompt, reference, kind = job
    raw = RAW / f"{name}.png"
    try:
        if force or not raw.exists():
            if reference and not reference.exists():
                return f"SKIP  {name}: 缺少参考图 {reference.name}"
            if not run_codex(name, prompt, reference):
                return f"FAIL  {name}: codex 没有产出文件"
        process(name, kind)
        return f"OK    {name}"
    except Exception as e:
        return f"FAIL  {name}: {e}"


def main():
    args = sys.argv[1:]
    force = "--force" in args
    wanted = {a for a in args if not a.startswith("--")}
    RAW.mkdir(parents=True, exist_ok=True)
    all_jobs = [j for j in jobs() if not wanted or j[0] in wanted]
    for phase in (1, 2):
        batch = [j for j in all_jobs if j[1] == phase]
        if not batch:
            continue
        print(f"== 阶段 {phase}: {len(batch)} 张", flush=True)
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for line in pool.map(lambda j: work(j, force), batch):
                print(line, flush=True)


if __name__ == "__main__":
    main()
