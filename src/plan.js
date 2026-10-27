import { evaluate } from "./index.js";

/** Pure: findings in, an ordered list of exact fixes out. Same input gives the same plan.
 *  Order matters: sizes first, then spacing, then one shift of the whole block.
 *  The plan is checked on a virtual copy of the layout with the same geometry rules; weight is an estimate. */
export function plan({ data, weight, fit }, rules, findings) {
  if (!findings.length) return { steps: [], predicted: "pass" };
  const { W, H, headerBottom } = data;
  const space = H - headerBottom, has = (r) => findings.some((f) => f.rule === r);
  const L = data.leaves.filter((l) => !l.fixed).map((l) => ({ ...l }));
  const steps = [], px = (n) => Math.round(n), name = (l) => l.sel || l.tag;
  const add = (rule, target, doIt, css) => steps.push({ rule, target, do: doIt, css });

  // 1. sides: text too close to, or past, a side edge
  const m = rules.minEdge + 4, seen = new Set();
  for (const l of L) {
    if (l.kind !== "text") continue;
    const left = l.x, right = W - l.x - l.w;
    if ((left < rules.minEdge || right < rules.minEdge) && !seen.has(name(l))) { seen.add(name(l)); add("edge-touch", name(l), `keep at least ${m}px from each side edge (now ${px(Math.min(left, right))}px)`, `padding-inline: max(${m}px, 4vw)`); }
    if (left < rules.minEdge) { l.w = Math.max(1, l.w - (m - l.x)); l.x = m; }
    if (W - l.x - l.w < rules.minEdge) l.w = Math.max(1, W - m - l.x);
  }
  if (has("overflow-x") || findings.some((f) => f.rule === "edge-cut")) {
    const wide = L.filter((l) => l.x < -1 || l.x + l.w > W + 1).map(name);
    add("overflow-x", [...new Set(wide)].join(", ") || "the widest element", "make it fit the width", "max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere");
  }

  // 2. sizes: one picture too tall (virtual: items below move up)
  const media = L.filter((l) => l.kind !== "text" && l.kind !== "panel").sort((a, b) => b.h - a.h)[0];
  if (media && media.h / space > rules.dominance) {
    const maxH = Math.floor(rules.dominance * space * 0.95), cut = media.h - maxH, edge = media.y + media.h;
    add("dominance", name(media), `make it at most ${maxH}px tall (now ${px(media.h)}px)`, `max-height: ${(maxH / H * 100).toFixed(1)}svh; object-fit: contain`);
    for (const l of L) if (l !== media && l.y >= edge - 1) l.y -= cut;
    media.h = maxH;
  }

  // 3. spacing: gaps under the limit (virtual: items below move down)
  const sorted = L.filter((l) => l.kind !== "box" && l.kind !== "panel").sort((a, b) => a.y - b.y);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1], gap = b.y - (a.y + a.h);
    if (gap >= 0 && gap < rules.minGap - 0.5 && Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)) {
      const need = Math.ceil(rules.minGap - gap);
      add("min-gap", name(b), `add ${need}px space above it, under ${name(a)}`, `margin-top: ${need + Math.round(gap)}px`);
      for (const l of L) if (l.y >= b.y - 0.5) l.y += need;
    }
  }

  // 4. height: content still runs past the bottom
  const bounds = () => ({ top: Math.min(...L.map((l) => l.y)), bottom: Math.max(...L.map((l) => l.y + l.h)) });
  let { top, bottom } = bounds();
  const clear = Math.ceil(rules.minTopClearance * H);
  const over = bottom - (H - clear);
  if (fit && over > 0 && (has("fold-cut") || has("bottom-clearance"))) {
    const tallest = [...L].sort((a, b) => b.h - a.h).filter((l) => l.kind !== "text").slice(0, 2).map(name).join(" or ") || "the tallest block";
    add("fold-cut", tallest, `the content is ${px(over)}px too tall: take ${px(over)}px off in total from picture heights and the spaces between blocks`, `sizes in svh: ${px(over)}px is about ${(over / H * 100).toFixed(1)}svh`);
    for (const l of L) l.y -= over * (l.y - top) / Math.max(1, bottom - top); // spread: lower items move up more
    ({ top, bottom } = bounds());
  }

  // 5. one shift of the whole block: equal space above and below, and weight back to the middle
  if (fit) {
    const topSpace = top - headerBottom, bottomSpace = H - bottom;
    let dy = 0;
    if (has("whitespace-tilt") || has("top-clearance") || has("bottom-clearance") || has("fold-cut") || (has("dominance"))) dy = (bottomSpace - topSpace) / 2;
    else if (has("centre-y") && weight) dy = -weight.dy * space;
    if (Math.abs(dy) >= 2) { add(has("centre-y") ? "centre-y" : "whitespace-tilt", "the whole content block", `move it ${dy > 0 ? "down" : "up"} ${px(Math.abs(dy))}px so the space above and below is equal`, `justify-content: center (min-height: 100svh) or padding-top: ${px(Math.max(0, topSpace + dy))}px`); for (const l of L) l.y += dy; }
  }
  if (has("centre-x") && weight) {
    const dx = -weight.dx * W;
    add("centre-x", "the heaviest block (picture or dark card)", `weight is ${px(Math.abs(weight.dx * W))}px to the ${weight.dx < 0 ? "left" : "right"}: move content ${dx > 0 ? "right" : "left"} ${px(Math.abs(dx))}px, or add a block of the same weight on the other side`, "margin-inline: auto (centre the column)");
  }

  const after = evaluate({ data: { ...data, leaves: [...L, ...data.leaves.filter((l) => l.fixed)] }, weight: null, fit }, rules);
  const left = after.map((f) => f.rule);
  return { steps, predicted: left.length ? "remaining: " + [...new Set(left)].join(", ") : "pass", weightIsEstimate: has("centre-x") || has("centre-y") };
}
