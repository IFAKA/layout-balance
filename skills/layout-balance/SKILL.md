---
name: layout-balance
description: Keep any web page or Android screen visually balanced. After ANY change to UI, layout, CSS or a page, run the layout-balance tool, fix every failure from its numbers, and measure again until it says balanced. Use whenever a page or screen is built, edited, resized or reviewed for looks.
---

# Keep the UI balanced (measure, fix, measure again)

The tool does the judging. It is deterministic: no AI, same page gives the same numbers. You only fix what it reports.

## Loop (never skip the last step)
1. Find the URL of the running page (dev server, for example `http://localhost:3000`). Start the server if needed (background, keep its PID).
2. Measure: `npx -y github:IFAKA/layout-balance <url> --json --out /tmp/lb`
   - Exit code 0 = balanced. Exit code 1 = at least one screen fails.
   - Without `--json` you get plain lines like `FAIL 1280x720 page` then `- fold-cut: content runs past the bottom (limit 0)`.
   - Screenshots of every screen are in `/tmp/lb`. Look at the failing ones.
3. Fix each finding with the table below. Change the smallest thing that moves the number. Fix the cause in the CSS or layout, not by hiding content.
4. Measure again (step 2). Repeat until exit code 0 on all viewports (phone 390x800, small laptop 1024x640, laptop 1280x720, desktop 1440x900).
5. Only then say it is done. Say the final line of the tool ("all N screens balanced"). If you could not reach 0, say which rule is left and why.

Android: `npx -y github:IFAKA/layout-balance android screens.json [--serial id]` (phone over adb, same loop).

## How to fix each rule
| Rule | Meaning | Fix |
|---|---|---|
| `centre-x` | Visual weight too far left or right (limit 10%) | Centre the content column; balance a side image with a block on the other side; equal side padding. |
| `centre-y` | Weight too high or low (limit 20%) | Move the heavy block (big picture, dark card) toward the middle; add space above or remove space below. |
| `whitespace-tilt` | Gap above content and gap below are very uneven (limit 12%) | Centre the content vertically (`min-height:100svh` plus `justify-content:center`), or give equal top and bottom padding. |
| `dominance` | One picture is taller than 45% of the screen | Cap its height (`max-height:45svh`, `object-fit:contain`) or crop it. |
| `fold-cut` | Content is cut by the bottom edge | Make the section fit: smaller type and spacing with `clamp()` and `svh`, fewer items, or let it scroll as a deliberate new section. |
| `top-clearance` / `bottom-clearance` | Content too close to the top bar or bottom edge (4%) | Add padding equal to the bar height plus a gap. |
| `edge-touch` / `edge-cut` | Text under 12px from a side edge, or past it | Add side padding (at least 16px); fix `width:100vw` and long words (`overflow-wrap:anywhere`). |
| `overflow-x` | Page scrolls sideways | Find the element wider than the screen (`max-width:100%`), remove fixed widths. |
| `min-gap` | Two stacked blocks closer than 8px | Add a gap or margin of at least 8px. |

## Rules for you
- Fix by changing layout, never by lowering limits in `balance.config.json` (only the user may change limits).
- A change that fixes one viewport can break another: always re-measure all four.
- Passing is a floor, not taste. Still look at the screenshots of what you changed.
- Do not claim balanced without a fresh run that exited 0.
- Needs Node 20+ and Chrome (or `npx playwright install chromium` once).
