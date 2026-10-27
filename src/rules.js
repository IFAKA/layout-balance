/** Pure: numbers in, findings out. No browser here, so it is easy to test. */
export function evaluate({ data, weight, fit }, rules) {
  const { W, H, headerBottom } = data;
  const out = [];
  const add = (rule, message, value, limit) => out.push({ rule, severity: "error", message, value: round(value), limit });
  const content = data.leaves.filter((l) => !l.fixed);
  const text = content.filter((l) => l.kind === "text");

  if (data.hscroll) add("overflow-x", "page scrolls sideways", 1, 0);
  for (const l of content) {
    if (l.x < -1 || l.x + l.w > W + 1) add("edge-cut", `${l.tag} runs past the left or right edge`, l.x < 0 ? l.x : l.x + l.w - W, 0);
  }
  for (const l of text) {
    if (l.x < rules.minEdge || l.x + l.w > W - rules.minEdge) add("edge-touch", `text "${l.tag}" is closer than ${rules.minEdge}px to a side edge`, Math.min(l.x, W - l.x - l.w), rules.minEdge);
  }
  const sorted = [...content].filter((l) => l.kind !== "box").sort((a, b) => a.y - b.y);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j];
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0;
    const gap = b.y - (a.y + a.h);
    if (overlapX && gap >= 0 && gap < rules.minGap - 0.5 && !(a.y <= b.y && a.y + a.h >= b.y + b.h)) { add("min-gap", `${a.tag} and ${b.tag} are ${Math.round(gap)}px apart`, gap, rules.minGap); break; }
  }

  if (!fit || !content.length) return dedupe(out);
  const top = Math.min(...content.map((l) => l.y)), bottom = Math.max(...content.map((l) => l.y + l.h));
  const space = H - headerBottom;
  for (const l of text) if (l.y < H && l.y + l.h > H + 1) add("fold-cut", `text "${l.tag}" is cut by the bottom of the screen`, l.y + l.h - H, 0);
  if (bottom > H + 1) add("fold-cut", "content runs past the bottom of the screen", bottom - H, 0);
  const topSpace = top - headerBottom, bottomSpace = H - bottom;
  if (topSpace < rules.minTopClearance * H) add("top-clearance", `content starts ${Math.round(topSpace)}px under the top bar`, topSpace / H, rules.minTopClearance);
  if (bottomSpace < rules.minTopClearance * H && bottom <= H + 1) add("bottom-clearance", `content ends ${Math.round(bottomSpace)}px from the bottom`, bottomSpace / H, rules.minTopClearance);
  const tilt = (topSpace - bottomSpace) / space;
  if (Math.abs(tilt) > rules.whitespaceTilt) add("whitespace-tilt", `empty space is uneven: ${Math.round(topSpace)}px above, ${Math.round(bottomSpace)}px below`, tilt, rules.whitespaceTilt);
  const big = content.filter((l) => l.kind !== "text").map((l) => l.h / space).sort((a, b) => b - a)[0] || 0;
  if (big > rules.dominance) add("dominance", `one picture takes ${Math.round(big * 100)}% of the screen`, big, rules.dominance);
  if (weight && !weight.empty) {
    if (Math.abs(weight.dx) > rules.centerX) add("centre-x", `weight sits ${Math.round(Math.abs(weight.dx) * 100)}% to the ${weight.dx < 0 ? "left" : "right"}`, weight.dx, rules.centerX);
    if (Math.abs(weight.dy) > rules.centerY) add("centre-y", `weight sits ${Math.round(Math.abs(weight.dy) * 100)}% too ${weight.dy < 0 ? "high" : "low"}`, weight.dy, rules.centerY);
  }
  return dedupe(out);
}
const dedupe = (list) => { const seen = new Set(); return list.filter((f) => !seen.has(f.rule + f.message) && seen.add(f.rule + f.message)); };
const round = (n) => Math.round(n * 1000) / 1000;
