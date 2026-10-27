---
name: layout-balance
description: Write web pages and Android screens visually balanced from the start, then check with the layout-balance tool and fix from its exact plan. Use whenever a page or screen is built, edited, resized or reviewed for looks.
---

# Balanced by construction, checked once

Goal: no loop. Write it balanced (part 1). In a new or changed page, measure once, apply the exact plan (part 2), measure once to confirm (part 3).

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

## 2. Measure once, fix from the plan
Run: `npx -y github:IFAKA/layout-balance <url> --plan --out /tmp/lb`
- Needs Node 20+ and Chrome (or `npx playwright install chromium` once). Android: `... android screens.json --plan`.
- Exit 0: done, say the tool's last line. Exit 1: for each failing screen it prints numbered steps: `[rule] selector: what to change, in px`, and a `css:` line. Apply them in order (sizes, then spacing, then one shift of the block).
- Use the css line as a start, but write it responsive (`svh`, `clamp()`), so one fix holds on all four sizes (390x800, 1024x640, 1280x720, 1440x900). The same selector may appear on several screens: use the strictest number.
- The line `plan check: pass` means the plan was tested on a copy of the layout (all geometry rules). Weight is an estimate (`weight is an estimate` appears): that is the part part 3 confirms.

## 3. Confirm once
Run the same command again (without changing limits). Exit 0 is the only proof of done.
- If it still fails, the plan was wrong for that page. Read the new plan, apply it, confirm again. If two rounds do not fix it, stop and tell the user the rule left and why. Do not loop.
- Look at the screenshots in `/tmp/lb` for what you changed.

## Rules for you
- Fix by changing layout. Never lower limits in `balance.config.json` (only the user may).
- Do not say balanced without a fresh run that exited 0.
- Passing is a floor, not taste.
