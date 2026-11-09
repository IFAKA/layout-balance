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
  const sorted = [...content].filter((l) => l.kind !== "box" && l.kind !== "panel").sort((a, b) => a.y - b.y);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j];
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0;
    const gap = b.y - (a.y + a.h);
    if (overlapX && gap >= 0 && gap < rules.minGap - 0.5 && !(a.y <= b.y && a.y + a.h >= b.y + b.h)) { add("min-gap", `${a.tag} and ${b.tag} are ${Math.round(gap)}px apart`, gap, rules.minGap); break; }
  }

  for (const i of boxIssues(data, rules, fit, H)) add(i.rule, i.message, i.value, i.limit);

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
  const big = content.filter((l) => l.kind !== "text" && l.kind !== "panel").map((l) => l.h / space).sort((a, b) => b - a)[0] || 0;
  if (big > rules.dominance) add("dominance", `one picture takes ${Math.round(big * 100)}% of the screen`, big, rules.dominance);
  if (weight && !weight.empty) {
    if (Math.abs(weight.dx) > rules.centerX) add("centre-x", `weight sits ${Math.round(Math.abs(weight.dx) * 100)}% to the ${weight.dx < 0 ? "left" : "right"}`, weight.dx, rules.centerX);
    if (Math.abs(weight.dy) > rules.centerY) add("centre-y", `weight sits ${Math.round(Math.abs(weight.dy) * 100)}% too ${weight.dy < 0 ? "high" : "low"}`, weight.dy, rules.centerY);
  }
  return dedupe(out);
}

/** The checks that know which box holds which piece. Pure. Each issue has `rule, message, value, limit` plus the numbers the fixer needs.
 *  Skips quietly when the data has no `boxes` or no `block` flags (Android and iOS pages). */
export function boxIssues({ boxes, leaves }, R, fit, H = 0) {
  const out = [], near = (a, b) => Math.abs(a - b) <= 1.5, r1 = (n) => Math.round(n * 10) / 10, px = (n) => Math.round(n) + "px";
  const tol = R.insetTolerance ?? 0.34, alignNear = R.alignNear ?? 8, maxGap = R.maxGap ?? 0.2, maxChars = R.maxLineChars ?? 90;
  const name = (b) => b.css.split(" ").pop().replace(/:nth-of-type\(\d+\)/, "") || b.tag;
  const uneven = (a, b) => Math.abs(a - b) > Math.max(4, tol * Math.max(a, b));
  if (boxes) for (const b of boxes) {
    const c = b.content; if (!c) continue;
    // 1-2. space inside a box: top vs bottom, left vs right
    if (!b.stretched) {
      const T = c.y - b.y, B = b.y + b.h - (c.y + c.h);
      if (Math.min(T, B) >= 1 && uneven(T, B)) out.push({ rule: "inset-y", message: `${name(b)}: ${px(T)} of space above the content, ${px(B)} below`, value: Math.abs(T - B), limit: Math.max(4, tol * Math.max(T, B)), box: b, T, B });
    }
    if (b.display !== "inline") {
      const L = b.centred ? c.x - b.x : b.pad[3] + b.border[3], Rr = b.centred ? b.x + b.w - (c.x + c.w) : b.pad[1] + b.border[1];
      if ((b.centred ? Math.min(L, Rr) >= 1 : true) && uneven(L, Rr)) out.push({ rule: "inset-x", message: `${name(b)}: ${px(L)} of space on the left of the content, ${px(Rr)} on the right`, value: Math.abs(L - Rr), limit: Math.max(4, tol * Math.max(L, Rr)), box: b, L, R: Rr });
    }
  }
  // 6. boxes side by side that should match
  if (boxes) {
    const by = new Map();
    for (const b of boxes) { if (!by.has(b.parent)) by.set(b.parent, []); by.get(b.parent).push(b); }
    for (const list of by.values()) {
      const done = new Set();
      for (const a of list) {
        const row = list.filter((o) => Math.min(a.y + a.h, o.y + o.h) - Math.max(a.y, o.y) > 0 && Math.abs(o.w - a.w) <= 0.1 * Math.max(o.w, a.w));
        const key = row.map((o) => o.css).sort().join();
        if (row.length < 2 || done.has(key)) continue; done.add(key);
        const hs = row.map((o) => o.h), dh = Math.max(...hs) - Math.min(...hs);
        if (dh > Math.max(4, 0.05 * Math.max(...hs))) out.push({ rule: "sibling-mismatch", message: `${row.length} boxes side by side (${name(row[0])}...) are ${px(Math.min(...hs))} to ${px(Math.max(...hs))} tall: make them the same height`, value: dh, limit: Math.max(4, 0.05 * Math.max(...hs)), boxes: row, kind: "height" });
        const sides = [0, 1, 2, 3].filter((i) => Math.max(...row.map((o) => o.pad[i])) - Math.min(...row.map((o) => o.pad[i])) > 2);
        if (sides.length) out.push({ rule: "sibling-mismatch", message: `${row.length} boxes side by side (${name(row[0])}...) have different padding (${row.map((o) => o.pad.map(px).join(" ")).join(" / ")}): use the same`, value: Math.max(...sides.map((i) => Math.max(...row.map((o) => o.pad[i])) - Math.min(...row.map((o) => o.pad[i])))), limit: 2, boxes: row, kind: "pad", sides });
      }
    }
  }
  // pieces that stand on their own line, grouped by the element that holds them
  const piece = leaves.filter((l) => !l.fixed && l.block && l.parent && (l.kind === "text" || l.kind === "media"));
  const top = (l) => l.y - (l.ext || 0), bot = (l) => l.y + l.h + (l.ext || 0);
  const overX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1;
  const above = (b, from) => from.filter((a) => a !== b && overX(a, b) && bot(a) <= top(b) + 2).sort((p, q) => bot(q) - bot(p))[0];
  const live = leaves.filter((l) => !l.fixed), groups = new Map();
  for (const l of piece) { if (!groups.has(l.parent)) groups.set(l.parent, []); groups.get(l.parent).push(l); }
  for (const [parent, list] of groups) {
    const pn = parent.split(" ").pop().replace(/:nth-of-type\(\d+\)/, "");
    // 3. same left edge (or same centre) for stacked pieces
    const seen = new Set();
    for (const a of list) for (const b of list) {
      if (a === b || !overX(a, b) || bot(a) > top(b) + 2) continue;
      const ctr = a.align === "center" && b.align === "center", d = ctr ? (a.x + a.w / 2) - (b.x + b.w / 2) : a.x - b.x;
      if (near(a.x, b.x) || near(a.x + a.w / 2, b.x + b.w / 2) || Math.abs(d) > alignNear || seen.has(parent)) continue;
      seen.add(parent);
      out.push({ rule: "align", message: `${a.tag} and ${b.tag} in ${pn} are ${r1(Math.abs(d))}px off the same ${ctr ? "centre" : "left edge"}: line them up`, value: Math.abs(d), limit: 1.5, group: list, centre: ctr });
    }
    // 4. gaps between stacked pieces: equal, or clearly different
    const gaps = [];
    for (const b of list) { const a = above(b, list); if (a) gaps.push({ a, b, gap: Math.max(0, top(b) - bot(a)) }); }
    const hit = gaps.find((g1) => gaps.some((g2) => { const hi = Math.max(g1.gap, g2.gap), d = Math.abs(g1.gap - g2.gap); return d > 1.5 && d <= 0.25 * hi; }));
    if (hit) {
      const other = gaps.find((g2) => { const hi = Math.max(hit.gap, g2.gap), d = Math.abs(hit.gap - g2.gap); return d > 1.5 && d <= 0.25 * hi; });
      out.push({ rule: "rhythm", message: `gaps ${px(hit.gap)} and ${px(other.gap)} between blocks in ${pn}: make them equal`, value: Math.abs(hit.gap - other.gap), limit: 1.5, gaps, parent });
    }
  }
  // 5. blocks too far apart: an empty band across the whole width, taller than the limit (only on a screen that should fit in one window)
  if (fit && H && leaves.some((l) => l.block != null)) {
    const items = live.filter((l) => l.kind !== "panel").sort((p, q) => top(p) - top(q));
    let edge = null;
    for (const b of items) {
      if (edge && top(b) - bot(edge) > maxGap * H && b.block && edge.block) {
        const g = top(b) - bot(edge);
        out.push({ rule: "max-gap", message: `${edge.tag} and ${b.tag} are ${px(g)} apart (${Math.round(g / H * 100)}% of the screen): blocks too far apart`, value: g / H, limit: maxGap, a: edge, b, gap: g, groupGaps: piece.filter((l) => l.parent === b.parent && l !== b).map((l) => { const p = above(l, piece); return p ? Math.max(0, top(l) - bot(p)) : null; }).filter((x) => x != null && x < maxGap * H) });
        break;
      }
      if (!edge || bot(b) > bot(edge)) edge = b;
    }
  }
  // 7. text lines that are too long to read
  for (const l of leaves) {
    if (l.fixed || l.kind !== "text" || !l.block || !l.lineH || !l.chars) continue;
    const lines = Math.round(l.h / l.lineH);
    if (lines < 2) continue;
    const per = l.chars / (lines - 0.5);
    if (per > maxChars) out.push({ rule: "line-length", message: `${l.tag} has about ${Math.round(per)} characters per line: keep lines under ${maxChars}`, value: per, limit: maxChars, leaf: l });
  }
  return out;
}
const dedupe = (list) => { const seen = new Set(); return list.filter((f) => !seen.has(f.rule + f.message) && seen.add(f.rule + f.message)); };
const round = (n) => Math.round(n * 1000) / 1000;
