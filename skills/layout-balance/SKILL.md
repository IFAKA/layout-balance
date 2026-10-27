---
name: layout-balance
description: Write web pages and Android screens visually balanced from the start, then check with the layout-balance tool and paste its tested fix. Use whenever a page or screen is built, edited, resized or reviewed for looks.
---

# Balanced by construction, fixed once

Goal: no loop. Write it balanced (part 1). In a new or changed page, measure once and paste the tested fix (part 2). No confirm run.

## 1. Write it balanced (the limits are known numbers; follow them while you write)
- Every full-screen section fits one screen: `min-height:100svh`, content inside it, nothing taller than `100svh`.
- Centre the content column: `display:flex; flex-direction:column; justify-content:center; align-items:center`. Equal space above and below.
- Any picture, video or big shape: `max-height:45svh` (the limit is 45% of the screen), `object-fit:contain`.
- Side padding at least 16px: `padding-inline:max(16px,4vw)`. Text never closer than 12px to a side edge.
- At least 8px between stacked blocks. Under a fixed top bar, add its height plus 4% of the screen as top padding.
- Weight: do not put the heavy block (big picture, dark card, bright button) on one side only. Centre it, or balance it with a block on the other side. Keep the heavy block near the vertical middle.
- Type and space in `clamp()` and `svh`, so one rule fits phone (390x800) and desktop (1440x900).
- Never `width:100vw` with padding; `max-width:100%` and `overflow-wrap:anywhere` on long text.
Weight (centre-x, centre-y) depends on pixel brightness, so only the tool can confirm it.

## 2. Measure once, paste the tested fix
Run: `npx -y github:IFAKA/layout-balance <url> --fix --out /tmp/lb`
- Needs Node 20+ and Chrome (or `npx playwright install chromium` once).
- Exit 0: done, say the tool's last line.
- Exit 1 and a `TESTED FIX` block: the tool already tried that CSS on the real page at all four sizes (390x800, 1024x640, 1280x720, 1440x900) and it passed. Paste the block at the end of the stylesheet (it uses `!important`, so order does not matter). Then you are done. Do not measure again.
- `NOT FULLY FIXED`: paste the block anyway, fix by hand only the rules listed under it (markup or sizes), and tell the user what is left. Do not loop.
- `--plan` (each step in px) is only for understanding a failure.

## Rules for you
- Fix by changing layout. Never lower limits in `balance.config.json` (only the user may).
- Do not say balanced without a fresh run that exited 0.
- Passing is a floor, not taste.
