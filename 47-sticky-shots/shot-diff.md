# #47 sticky-note split screenshot comparison (design list of 40)

PR #165 (`refactor/47-split-sticky-note` head `2374e60762fd44f5a0af8e0ae9495afa48169bb6`) vs new main `22740876028e1193c4ba410666b0a77c718eb036` (#163). Compared **only** the 40 design-approved shots in `/workspace/clarityokr-sprint4/screenshot-final.md` (20 screens × light/dark). Mapping: `/workspace/clarityokr-sprint5/47-sticky-shots/shot-map.json` (same 40 `impl` filenames as the Angular 21→22 review).

This pack is for designer sign-off. **PR #165 was not merged.** The clarification state-machine PR was not started.

## Runs

| | Baseline (new main) | After (#47 sticky-note / PR #165) |
|---|---|---|
| Temporary branch | `ci/temp-e2e-impl-shots-main-47` (`de837f4` = `2274087` + workflow only) | `ci/temp-e2e-impl-shots-47-sticky` (`fc4b4ca` = `2374e60` + workflow only) |
| Workflow run | [43803863596](https://github.com/Jackela/ClarityOKR/actions/runs/43803863596) | [43803865463](https://github.com/Jackela/ClarityOKR/actions/runs/43803865463) |
| E2E job | [133090705158](https://github.com/Jackela/ClarityOKR/actions/runs/43803863596/job/133090705158) 13:26:12–13:34:49 JST | [133090705392](https://github.com/Jackela/ClarityOKR/actions/runs/43803865463/job/133090705392) 13:26:12–13:36:08 JST |
| `IMPL_SHOTS_DIR` artifact | [`impl-shots-de837f4418086676a951dc9b46462b8156f74470`](https://github.com/Jackela/ClarityOKR/actions/runs/43803863596/artifacts/14198395023) (218 PNGs) | [`impl-shots-fc4b4cabfe191b28b411fdb84505eb0189b49f21`](https://github.com/Jackela/ClarityOKR/actions/runs/43803865463/artifacts/14197554944) (218 PNGs) |
| Runner OS / image | ubuntu-24.04 / **ubuntu24/20261111.370.1** | ubuntu-24.04 / **ubuntu24/20261111.127.1** |
| Runner version | 2.338.2 | 2.338.2 |
| Xvfb / window | `xvfb-run -a -s "-screen 0 1280x800x24"`; Playwright CI viewport 1280×720; main window constructor 1200×800 (framed); sticky 420×560 (frameless) | same |

The temporary workflow is **not** in PR #165. Do not merge those branches.

The two hosted runner **image patch versions** are not identical (`.370.1` vs `.127.1`, both `ubuntu24/20261111.*`). That is called out because the brief asked for the same runner image. It did not produce a font or raster shift in this pair: 22 of the 40 shots — including typography-heavy sticky UI (menus, text-edit, leave-confirm, restored focus, narrow banner wrap) — are **byte-for-pixel identical**, and every one of the 18 diffs is a 6–8×4–10 clock/timestamp digit box (in-app clocks read **04:28–04:31** UTC on the baseline run and **04:29–04:32** UTC on the PR run, about one minute apart, matching the job overlap). 1px vertical alignment of those 18 diffs makes the mismatch far *worse*, so none of them is a global shift.

## Size census (all 218 captures, including shots outside the 40)

Known framed-window variance (#146): main-window shots are an unclipped `page.screenshot()` of the Electron **client area** of a framed 1200×800 window, so Linux/Xvfb title-bar height can change PNG height. Frameless sticky shots should stay at constructor size.

This pair of runs had **identical sizes** on every capture. The 1–2px title-bar variance did **not** appear:

| Size | Meaning | Baseline | PR #165 |
|---|---|---|---|
| 1200×771 | framed main window (800 − 29 px chrome) | 44 | 44 |
| 420×560 | frameless sticky (constructor size) | 162 | 162 |
| 320×640 | test-resized sticky | 6 | 6 |
| 320×560 | test-resized sticky | 4 | 4 |
| 340×560 | test-resized sticky | 2 | 2 |
| **total** | | **218** | **218** |

44 / 44 framed shots are 1200×771 on both sides. 174 / 174 frameless/narrow shots have identical sizes (and match the constructor or test `setSize`).

## Designer criteria (from `screenshot-final.md` / the Angular upgrade review)

Position/size change >1px (including wrapping), color/token change, font change, element added/removed, or focus/selected-state change = **regression**. Glyph-edge anti-aliasing with unchanged boxes, and dynamic caret/timestamps/clocks = **ignorable**. Framed main-window title-bar height variance of 1–2px is known #146 (did not appear here). Anything else is **uncertain** and needs designer review.

## Verdict summary

| | Count |
|---|---|
| Compared | 40 |
| Missing | 0 |
| Pixel-identical | **22** |
| Differing | **18** |
| Preliminary **regression** | **0** |
| Preliminary **uncertain** | **0** |
| Preliminary **ignorable** | **18** (clock / history / backup timestamps only; element boxes, chrome, type, and controls unchanged) |

The 18 diffs are the same dynamic-time family as in the Angular 21→22 review (`ng22-shot-diff.md`). Sticky-note UI that this PR actually split (regenerate confirm, banners, menus, text-edit, restored focus, narrow wrap) is either pixel-identical or differs only in the header/body clock digits.

## 40-shot summary

Pixel counts are pixelmatch (`threshold=0.1`, `includeAA=True`). Tight change is ImageChops RGB-nonzero connected boxes (tighter than pixelmatch with AA included). All 40 have identical PNG sizes.

| # | Shot | Identical / diff px | Tight change | Verdict | One-line reason |
|---|---|---|---|---|---|
| 1 | `S3-01-main-bar-wizard-light` | 44 (0.005%) | two 7×9 boxes at (399,501) | ignorable | Status-bar clock `04:29` → `04:30`. Layout unchanged. |
| 2 | `S3-01-main-bar-wizard-dark` | 42 (0.005%) | two 7×9 boxes at (399,501) | ignorable | Same clock as #1 (dark). |
| 3 | `S3-04-discard-confirm-light` | 29 (0.003%) | two 7×9 boxes at (399,501) | ignorable | Same status-bar clock; dialog chrome, type, and buttons unchanged. |
| 4 | `S3-04-discard-confirm-dark` | 21 (0.002%) | two 7×9 boxes at (399,501) | ignorable | Same as #3 (dark). |
| 5 | `S3-03-restored-focus-light` | identical (0) | — | identical | — |
| 6 | `S3-03-restored-focus-dark` | identical (0) | — | identical | — |
| 7 | `S3-09b-main-restored-focus-light` | identical (0) | — | identical | — |
| 8 | `S3-09b-main-restored-focus-dark` | identical (0) | — | identical | — |
| 9 | `S3-16-wizard-restored-step-n-light` | identical (0) | — | identical | — |
| 10 | `S3-16-wizard-restored-step-n-dark` | identical (0) | — | identical | — |
| 11 | `S3-16c-wizard-ready-to-generate-light` | identical (0) | — | identical | — |
| 12 | `S3-16c-wizard-ready-to-generate-dark` | identical (0) | — | identical | — |
| 13 | `S3-02-sticky-bar-text-edit-review-light` | 44 (0.019%) | two 7×9 boxes at (210,292) | ignorable | Sticky clock seconds/minutes only. |
| 14 | `S3-02-sticky-bar-text-edit-review-dark` | 42 (0.018%) | two 7×9 boxes at (210,292) | ignorable | Same clock as #13 (dark). |
| 15 | `D1b-05-review-leave-confirm` | identical (0) | — | identical | — |
| 16 | `D1b-06-review-leave-confirm-dark` | identical (0) | — | identical | — |
| 17 | `S2-03-banner-ending-light` | 23 (0.010%) | 6×9 + 2×1 AA at (218,172) | ignorable | Banner/header clock only. |
| 18 | `S2-03-banner-ending-dark` | 22 (0.009%) | 6×9 + 2×1 AA at (218,172) | ignorable | Same clock as #17 (dark). |
| 19 | `S2-12-main-banner-stale-light` | identical (0) | — | identical | — |
| 20 | `S2-12-main-banner-stale-dark` | identical (0) | — | identical | — |
| 21 | `D1b-09-text-edit` | identical (0) | — | identical | — |
| 22 | `D1b-10-text-edit-dark` | identical (0) | — | identical | — |
| 23 | `S2-16-progress-save-failed-light` | 38 (0.016%) | one 7×9 box at (221,124) | ignorable | Header clock only; 「⚠ 没能保存」 row unchanged. |
| 24 | `S2-16-progress-save-failed-dark` | 37 (0.016%) | one 7×9 box at (221,124) | ignorable | Same as #23 (dark). |
| 25 | `S1-40-history-3-updates-1-revert-light` | 286 (0.122%) | six 7–8×9–10 boxes | ignorable | History / chart labels `04:30` → `04:31`. Chart path, list structure, 「进度记录」 control unchanged. |
| 26 | `S1-40-history-3-updates-1-revert-dark` | 284 (0.121%) | six 7–8×9–10 boxes | ignorable | Same timestamps as #25 (dark). |
| 27 | `D3-03-regenerate-confirm-all` | 35 (0.015%) | 6×9 header clock + 7×9 body time | ignorable | Header `4:31` → `4:32` and 「今天 04:31」 → 「今天 04:32」. 取消 / 重新生成 unchanged. |
| 28 | `D3-04-regenerate-confirm-all-dark` | 28 (0.012%) | 6×9 header clock + 7×9 body time | ignorable | Same as #27 (dark). |
| 29 | `S1-24-backup-preview-light` | 36 (0.015%) | 8×4 clock + 8×10 body time | ignorable | 「备份于 今天 04:28」 → 「今天 04:29」, plus the small header clock. Preview copy unchanged. |
| 30 | `S1-24-backup-preview-dark` | 34 (0.014%) | 8×4 clock + 8×10 body time | ignorable | Same as #29 (dark). |
| 31 | `D1b-19-export-menu` | identical (0) | — | identical | — |
| 32 | `D1b-20-export-menu-dark` | identical (0) | — | identical | — |
| 33 | `D2-03-more-menu` | identical (0) | — | identical | — |
| 34 | `D2-04-more-menu-dark` | identical (0) | — | identical | — |
| 35 | `D2-07-quit-confirm-main-two-reasons` | identical (0) | — | identical | — |
| 36 | `D2-08-quit-confirm-main-two-reasons-dark` | identical (0) | — | identical | — |
| 37 | `S3-10-sticky-420-objective-kr-added-light` | 44 (0.019%) | two 7×9 boxes at (213,313) | ignorable | Same clock-digit family as #13. |
| 38 | `S3-10-sticky-420-objective-kr-added-dark` | 42 (0.018%) | two 7×9 boxes at (213,313) | ignorable | Same as #37 (dark). |
| 39 | `S2-10-narrow-banner-wraps-light` | identical (0) | — | identical | — |
| 40 | `S2-10-narrow-banner-wraps-dark` | identical (0) | — | identical | — |

## Where the images are

- This report: `/workspace/clarityokr-sprint5/47-sticky-shots/shot-diff.md`
- Raw results JSON: `/workspace/clarityokr-sprint5/47-sticky-shots/diff-results.json`
- The 40 baseline PNGs: `/workspace/clarityokr-sprint5/47-sticky-shots/baseline-main/`
- The 40 PR PNGs: `/workspace/clarityokr-sprint5/47-sticky-shots/pr-165/`
- Before / after / diff / comparison (the 18 differing shots): `/workspace/clarityokr-sprint5/47-sticky-shots/main-vs-pr/`
- Inspection zooms (ImageChops, 4× nearest) and boxed crops: `/workspace/clarityokr-sprint5/47-sticky-shots/inspection/`
- Baseline raw artifact (all 218): [run 43803863596 / `impl-shots-de837f4…`](https://github.com/Jackela/ClarityOKR/actions/runs/43803863596/artifacts/14198395023)
- PR raw artifact (all 218): [run 43803865463 / `impl-shots-fc4b4ca…`](https://github.com/Jackela/ClarityOKR/actions/runs/43803865463/artifacts/14197554944)

The 12 committed `tests/e2e/screenshots/s3-12/` baselines also differ from *both* CI runs (different capture date); that is not a gate (same appendix case as the Angular upgrade review). Optional compares are under `main-vs-committed-s3/` and `pr-vs-committed-s3/`.

Compared 2026-11-16 13:38:19–13:40:16 JST with `compare-shots.py` (pixelmatch threshold 0.1, `includeAA=True`).
