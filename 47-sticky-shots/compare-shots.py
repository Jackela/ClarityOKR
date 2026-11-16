#!/usr/bin/env python3
"""Pixel-diff the 40 design-approved shots (new main vs #47 sticky-note PR)."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pixelmatch.contrib.PIL import pixelmatch

MAP = Path("/workspace/clarityokr-sprint5/47-sticky-shots/shot-map.json")
OUT = Path("/workspace/clarityokr-sprint5/47-sticky-shots")
REPORT = Path("/workspace/clarityokr-sprint5/47-sticky-shots/shot-diff.md")
S3_REPO = Path("/workspace/wt-47-sticky/tests/e2e/screenshots/s3-12")
THRESHOLD = 0.1


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def ensure_same_size(a: Image.Image, b: Image.Image) -> tuple[Image.Image, Image.Image, bool]:
    if a.size == b.size:
        return a, b, False
    w, h = max(a.size[0], b.size[0]), max(a.size[1], b.size[1])

    def pad(im: Image.Image) -> Image.Image:
        canvas = Image.new("RGBA", (w, h), (255, 0, 255, 255))
        canvas.paste(im, (0, 0))
        return canvas

    return pad(a), pad(b), True


def pm(a: Image.Image, b: Image.Image) -> tuple[int, Image.Image]:
    diff = Image.new("RGBA", a.size)
    n = pixelmatch(a, b, diff, threshold=THRESHOLD, includeAA=True)
    return n, diff


def side_by_side(before: Image.Image, after: Image.Image, diff: Image.Image, title: str) -> Image.Image:
    w = max(before.width, after.width, diff.width)
    h = max(before.height, after.height, diff.height)
    pad = 16
    label_h = 36
    canvas = Image.new("RGB", (w * 3 + pad * 4, h + pad * 2 + label_h), (32, 32, 32))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    labels = ["before (new main)", "after (#47 sticky-note)", "diff"]
    imgs = [before.convert("RGB"), after.convert("RGB"), diff.convert("RGB")]
    x = pad
    for label, im in zip(labels, imgs):
        draw.text((x, 8), label, fill=(240, 240, 240), font=font)
        canvas.paste(im, (x, label_h + pad // 2))
        x += w + pad
    draw.text((pad, canvas.height - 14), title, fill=(200, 200, 200), font=font)
    return canvas


def align_and_compare(a: Image.Image, b: Image.Image) -> dict:
    """For known framed-window 1–2px height variance: top-align crop + optional 1px shift."""
    info: dict = {"tried": False}
    if a.size[0] != b.size[0]:
        return info
    dw = a.size[0]
    ha, hb = a.size[1], b.size[1]
    if abs(ha - hb) == 0:
        # still try 1px shift in case of letterbox split across both edges
        info["tried"] = True
        info["size_delta_h"] = 0
        variants = {}
        for dy in (0, 1, -1):
            if dy == 0:
                n, _ = pm(a, b)
                variants["dy0"] = n
                continue
            h = min(ha, hb) - abs(dy)
            if h <= 0:
                continue
            if dy > 0:
                # after is shifted down by 1: compare a[0:h] vs b[1:1+h]
                aa = a.crop((0, 0, dw, h))
                bb = b.crop((0, dy, dw, dy + h))
            else:
                aa = a.crop((0, -dy, dw, -dy + h))
                bb = b.crop((0, 0, dw, h))
            n, _ = pm(aa, bb)
            variants[f"dy{dy}"] = n
        info["align_mismatches"] = variants
        return info

    if abs(ha - hb) > 4:
        info["tried"] = True
        info["size_delta_h"] = hb - ha
        info["note"] = "height delta >4px; not treated as title-bar variance"
        return info

    info["tried"] = True
    info["size_delta_h"] = hb - ha
    h = min(ha, hb)
    # top-aligned crop
    n_top, _ = pm(a.crop((0, 0, dw, h)), b.crop((0, 0, dw, h)))
    # bottom-aligned crop
    n_bot, _ = pm(a.crop((0, ha - h, dw, ha)), b.crop((0, hb - h, dw, hb)))
    variants = {"top_crop": n_top, "bottom_crop": n_bot}
    # 1px shifts on the overlapping top crop
    for dy in (1, -1):
        hh = h - 1
        if dy > 0:
            aa = a.crop((0, 0, dw, hh))
            bb = b.crop((0, 1, dw, 1 + hh))
        else:
            aa = a.crop((0, 1, dw, 1 + hh))
            bb = b.crop((0, 0, dw, hh))
        n, _ = pm(aa, bb)
        variants[f"top_crop_dy{dy}"] = n
    info["align_mismatches"] = variants
    return info


def census(dir_path: Path) -> dict:
    sizes = Counter()
    framed = 0
    frameless = 0
    files = sorted(dir_path.glob("*.png"))
    for p in files:
        im = Image.open(p)
        sizes[f"{im.size[0]}x{im.size[1]}"] += 1
        if im.size[0] == 1200:
            framed += 1
        else:
            frameless += 1
    return {
        "count": len(files),
        "sizes": dict(sizes),
        "framed_1200_wide": framed,
        "non_1200_wide": frameless,
    }


def compare_pair(before_p: Path, after_p: Path, dest_prefix: Path) -> dict:
    result = {
        "before": str(before_p),
        "after": str(after_p),
        "exists_before": before_p.is_file(),
        "exists_after": after_p.is_file(),
        "identical": False,
        "size_mismatch": False,
        "before_size": None,
        "after_size": None,
        "mismatched_pixels": None,
        "total_pixels": None,
        "diff_percent": None,
        "diff_image": None,
        "comparison_image": None,
        "changed_bbox": None,
        "alignment": None,
        "error": None,
    }
    if not before_p.is_file() or not after_p.is_file():
        result["error"] = "missing file"
        return result
    a, b = load(before_p), load(after_p)
    result["before_size"] = list(a.size)
    result["after_size"] = list(b.size)
    a2, b2, padded = ensure_same_size(a, b)
    result["size_mismatch"] = padded
    dest_prefix.parent.mkdir(parents=True, exist_ok=True)
    mismatched, diff = pm(a2, b2)
    total = a2.size[0] * a2.size[1]
    result["mismatched_pixels"] = mismatched
    result["total_pixels"] = total
    result["diff_percent"] = round(100.0 * mismatched / total, 4) if total else None
    result["identical"] = mismatched == 0 and not padded
    result["changed_bbox"] = list(diff.getbbox() or ()) or None
    result["alignment"] = align_and_compare(a, b)
    if not result["identical"]:
        diff_path = dest_prefix.with_name(dest_prefix.name + "-diff.png")
        cmp_path = dest_prefix.with_name(dest_prefix.name + "-comparison.png")
        before_out = dest_prefix.with_name(dest_prefix.name + "-before.png")
        after_out = dest_prefix.with_name(dest_prefix.name + "-after.png")
        a.save(before_out)
        b.save(after_out)
        diff.save(diff_path)
        side_by_side(a2, b2, diff, dest_prefix.name).save(cmp_path)
        result["diff_image"] = str(diff_path)
        result["comparison_image"] = str(cmp_path)
        result["before_copy"] = str(before_out)
        result["after_copy"] = str(after_out)
        # compact jpeg
        jpg = dest_prefix.with_name(dest_prefix.name + "-comparison.jpg")
        side = side_by_side(a2, b2, diff, dest_prefix.name)
        side.thumbnail((min(3600, side.width), min(1400, side.height)), Image.Resampling.LANCZOS)
        side.save(jpg, quality=85)
        result["comparison_jpeg"] = str(jpg)
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--main-dir", required=True)
    ap.add_argument("--pr-dir", required=True)
    ap.add_argument("--runner-main", default="")
    ap.add_argument("--runner-pr", default="")
    args = ap.parse_args()

    mapping = json.loads(MAP.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    main_dir, ng22_dir = Path(args.main_dir), Path(args.pr_dir)

    results = []
    missing = []
    identical = 0
    differing = []
    for row in mapping:
        name = row["impl"]
        rec = {
            **row,
            "main_vs_ng22": compare_pair(
                main_dir / f"{name}.png", ng22_dir / f"{name}.png", OUT / "main-vs-pr" / name
            ),
        }
        if row.get("baseline"):
            committed = S3_REPO / Path(row["baseline"]).name
            rec["ng22_vs_committed_s3"] = compare_pair(
                committed, ng22_dir / f"{name}.png", OUT / "pr-vs-committed-s3" / name
            )
            rec["main_vs_committed_s3"] = compare_pair(
                committed, main_dir / f"{name}.png", OUT / "main-vs-committed-s3" / name
            )
        results.append(rec)
        mv = rec["main_vs_ng22"]
        if mv.get("error"):
            missing.append(name)
        elif mv["identical"]:
            identical += 1
        else:
            differing.append(rec)

    payload = {
        "runner_main": args.runner_main,
        "runner_pr": args.runner_pr,
        "main_dir": str(main_dir),
        "pr_dir": str(ng22_dir),
        "main_census": census(main_dir),
        "pr_census": census(ng22_dir),
        "compared": len(mapping),
        "identical": identical,
        "differing": len(differing),
        "missing": missing,
        "results": results,
    }
    (OUT / "diff-results.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(
        json.dumps(
            {
                k: payload[k]
                for k in (
                    "compared",
                    "identical",
                    "differing",
                    "missing",
                    "main_census",
                    "pr_census",
                )
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
