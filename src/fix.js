import { launch, getScreens, measureScreen, check, NO_MOTION } from "./index.js";

/** Find CSS that makes every screen pass, by trying it on the real page and measuring again.
 *  Same page and config give the same CSS. Nothing is returned as `verified` unless a fresh run of the finished CSS passes everywhere.
 *  Levers are tried in a fixed order; each one reacts to one rule. */
export async function fix(url, config) {
  const browser = await launch();
  const found = []; // { viewport, css: Map<selector, Map<prop, value>> , left }
  try {
    for (const vp of config.viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(config.settleMs);
      const rules = new Map(); // selector -> Map(prop -> value)
      const set = (sel, prop, val) => { if (!rules.has(sel)) rules.set(sel, new Map()); const r = rules.get(sel); if (r.get(prop) === val) return false; r.set(prop, val); return true; };
      const inject = async () => {
        await page.evaluate((css) => { let t = document.getElementById("lb-fix"); if (!t) { t = document.createElement("style"); t.id = "lb-fix"; document.head.appendChild(t); } t.textContent = css; }, NO_MOTION + render(rules));
        await page.waitForTimeout(120);
      };
      const count = (await getScreens(page, config)).length;
      for (let i = 0; i < count; i++) {
        for (let round = 0; round < 12; round++) {
          const s = (await getScreens(page, config))[i];
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), s.top);
          await page.waitForTimeout(80);
          const m = await measureScreen(page, config.rules, s.fit);
          if (!m.findings.length) break;
          if (!(await lever(page, s, m, config.rules, set))) break;
          await inject();
        }
      }
      await page.close();
      found.push({ viewport: vp, rules });
    }
  } finally { await browser.close(); }

  const css = merge(found, config.viewports);
  const after = css ? await check(url, config, { css }) : await check(url, config);
  const bad = after.filter((r) => r.findings.length);
  return { verified: !bad.length, css, screens: after.length, failing: bad };
}

const render = (rules) => [...rules].map(([sel, props]) => `${sel}{${[...props].map(([p, v]) => `${p}:${v}!important`).join(";")}}`).join("\n");

/** One CSS text: a block that is the same on every viewport is written once; other blocks sit in a width band. */
function merge(found, viewports) {
  const byBlock = new Map();
  for (const f of found) for (const line of render(f.rules).split("\n").filter(Boolean)) {
    if (!byBlock.has(line)) byBlock.set(line, []);
    byBlock.get(line).push(f.viewport);
  }
  const widths = viewports.map((v) => v.width).sort((a, b) => a - b);
  const band = (v) => {
    const i = widths.indexOf(v.width);
    const lo = i ? Math.floor((widths[i - 1] + v.width) / 2) + 1 : null, hi = i < widths.length - 1 ? Math.floor((v.width + widths[i + 1]) / 2) : null;
    return [lo != null ? `(min-width:${lo}px)` : "", hi != null ? `(max-width:${hi}px)` : ""].filter(Boolean).join(" and ");
  };
  const open = [], banded = new Map();
  for (const [line, vps] of byBlock) {
    if (vps.length === viewports.length) { open.push(line); continue; }
    for (const v of vps) { const b = band(v); if (!banded.has(b)) banded.set(b, []); banded.get(b).push(line); }
  }
  return [...open, ...[...banded].map(([b, lines]) => `@media ${b} {\n${lines.map((l) => "  " + l).join("\n")}\n}`)].join("\n");
}

/** One step: look at the first failing rule and set CSS for it. Returns false when there is nothing new to try. */
async function lever(page, s, m, R, set) {
  const { data, weight } = m, rule = (r) => m.findings.some((f) => f.rule === r), H = data.H;
  const space = H - data.headerBottom, S = s.css;
  const content = data.leaves.filter((l) => !l.fixed);
  let changed = false; const go = (...a) => { if (set(...a)) changed = true; };

  // 1. sides
  if (rule("edge-touch") || rule("edge-cut") || rule("overflow-x")) {
    go(S, "box-sizing", "border-box"); go(S, "padding-inline", `max(${R.minEdge + 4}px,4vw)`);
    for (const l of content.filter((l) => l.x < -1 || l.x + l.w > data.W + 1)) { go(l.css, "max-width", "100%"); go(l.css, "overflow-wrap", "anywhere"); }
    if (changed) return true;
  }
  // 2. one picture too big
  const media = content.filter((l) => l.kind !== "text" && l.kind !== "panel").sort((a, b) => b.h - a.h)[0];
  if (rule("dominance") && media) {
    const svh = Math.floor((R.dominance * space * 0.95) / H * 1000) / 10;
    go(media.css, "max-height", `${svh}svh`); go(media.css, "height", `${svh}svh`); go(media.css, "object-fit", "contain");
    if (changed) return true;
  }
  // 3. spacing between neighbours
  if (rule("min-gap")) {
    const sorted = content.filter((l) => l.kind !== "box" && l.kind !== "panel").sort((a, b) => a.y - b.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1], gap = b.y - (a.y + a.h);
      if (gap >= 0 && gap < R.minGap - 0.5 && Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)) {
        const mt = await page.evaluate((q) => parseFloat(getComputedStyle(document.querySelector(q)).marginTop) || 0, b.css);
        go(b.css, "margin-top", `${Math.round(mt + Math.ceil(R.minGap - gap))}px`);
        if (changed) return true;
      }
    }
  }
  // 4. too tall: shrink the tallest picture, then the section padding
  const top = Math.min(...content.map((l) => l.y)), bottom = Math.max(...content.map((l) => l.y + l.h));
  const over = bottom - (H - Math.ceil(R.minTopClearance * H));
  if (over > 0 && (rule("fold-cut") || rule("bottom-clearance"))) {
    if (media && media.h - over >= H * 0.12) { const svh = Math.floor((media.h - over) / H * 1000) / 10; go(media.css, "max-height", `${svh}svh`); go(media.css, "height", `${svh}svh`); go(media.css, "object-fit", "contain"); if (changed) return true; }
    go(S, "padding-block", "2svh"); if (changed) return true;
  }
  // 5. centre the block: equal space above and below, and the weight in the middle
  const base = ["whitespace-tilt", "top-clearance", "bottom-clearance", "centre-y", "centre-x", "fold-cut"].some(rule);
  if (base) {
    go(S, "display", "flex"); go(S, "flex-direction", "column"); go(S, "justify-content", "center"); go(S, "align-items", "center");
    go(S, "box-sizing", "border-box"); go(S, "min-height", "100svh"); go(S, "text-align", "center");
    if (data.headerBottom > 0) go(S, "padding-top", `${Math.ceil(data.headerBottom)}px`);
    if (changed) return true;
  }
  if (rule("centre-x") && weight) {
    const heavy = content.filter((l) => l.kind !== "text").sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (heavy) { go(heavy.css, "margin-inline", "auto"); if (changed) return true; }
  }
  void weight; void top;
  return false;
}
