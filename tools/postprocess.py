"""把 codex 生成的原图处理成游戏可用的素材。

  角色 (char): 从图片边缘泛洪去掉纯色背景（品红或白色），羽化边缘、去品红溢色，裁掉透明边，缩放到指定高度
  特效 (fx):   黑底图转成"亮度即透明度"的 PNG，适合叠加混合
  背景 (bg):   只缩放

用法: python postprocess.py <raw.png> <out.png> <char|fx|bg> [目标高度]
"""
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def key_magenta(img: Image.Image) -> Image.Image:
    """品红底全局抠图：发丝、手臂间的封闭空隙也能去干净；角色本身几乎不会出现纯品红。"""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    m = np.minimum(r, b) - g  # "品红程度"
    # m 从 70 到 170 之间线性过渡为透明；要求 R、B 都足够高，避免误伤紫色衣物
    strength = np.clip((m - 70) / 100, 0, 1) * np.clip((np.minimum(r, b) - 120) / 60, 0, 1)
    alpha = (1 - strength) * 255
    alpha = np.asarray(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)
    # 去溢色：只处理透明区域附近 4px 的边缘带（发丝、衣角），内部的紫色衣物不受影响
    near_bg = np.asarray(Image.fromarray(((alpha < 200) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    spill = near_bg & (m > 0)
    cap = g + 10
    r2 = np.where(spill, np.minimum(r, np.maximum(cap, g)), r)
    b2 = np.where(spill, np.minimum(b, np.maximum(cap, g)), b)
    rgba = np.dstack([r2, g, b2, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def key_background(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w, _ = rgb.shape
    # 顶边像素的中位色作为背景色（半身像的下边缘是角色身体，不能用四角）
    bg = np.median(rgb[2], axis=0)
    is_magenta = bg[0] > 180 and bg[2] > 180 and bg[1] < 90
    if is_magenta:
        return key_magenta(img)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    tol = 26

    # 只去掉和边缘连通的背景，避免把角色身上同色的部分挖掉
    candidate = dist < tol
    bgmask = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if candidate[y, x] and not bgmask[y, x]:
                bgmask[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if candidate[y, x] and not bgmask[y, x]:
                bgmask[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and candidate[ny, nx] and not bgmask[ny, nx]:
                bgmask[ny, nx] = True
                q.append((ny, nx))

    alpha = np.where(bgmask, 0, 255).astype(np.uint8)
    # 边缘羽化：对边界附近按颜色距离做软过渡
    a_img = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    alpha = np.asarray(a_img).astype(np.float32)
    soft = np.clip((dist - tol * 0.5) / (tol * 0.8), 0, 1) * 255
    edge = (alpha > 0) & (alpha < 255)
    alpha = np.where(edge, np.minimum(alpha, soft + 60), alpha)

    out = np.asarray(img.convert("RGB")).astype(np.float32)
    if is_magenta:  # 去品红溢色：R、B 不超过 G 太多
        g = out[:, :, 1]
        limit = g + 40
        fringe = alpha < 250
        out[:, :, 0] = np.where(fringe, np.minimum(out[:, :, 0], limit), out[:, :, 0])
        out[:, :, 2] = np.where(fringe, np.minimum(out[:, :, 2], limit), out[:, :, 2])
    rgba = np.dstack([out, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def fx_from_black(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - 12) * 1.15, 0, 255)
    # 反预乘，叠加混合下颜色更饱满
    safe = np.maximum(alpha, 1)[..., None] / 255.0
    color = np.clip(rgb / safe, 0, 255)
    rgba = np.dstack([color, alpha]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def trim(img: Image.Image, pad: int = 6) -> Image.Image:
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def fit_height(img: Image.Image, height: int) -> Image.Image:
    if img.height <= height:
        return img
    w = round(img.width * height / img.height)
    return img.resize((w, height), Image.LANCZOS)


def main() -> None:
    src, dst, kind = sys.argv[1], sys.argv[2], sys.argv[3]
    height = int(sys.argv[4]) if len(sys.argv) > 4 else {"char": 520, "portrait": 320, "fx": 512, "bg": 1600}[kind]
    img = Image.open(src)
    if kind == "char":
        img = trim(key_background(img))
    elif kind == "portrait":
        img = key_background(img)
    elif kind == "fx":
        img = trim(fx_from_black(img), pad=2)
    img = fit_height(img, height)
    img.save(dst, optimize=True)
    print(f"{dst}: {img.width}x{img.height}")


if __name__ == "__main__":
    main()
