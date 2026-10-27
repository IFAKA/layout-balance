import { launch, getScreens, measureScreen, check, settle, NO_MOTION } from "./index.js";

/** Find CSS that makes every screen pass, by trying it on the real page and measuring again.
 *  Same page and config give the same CSS. Nothing is returned as `verified` unless a fresh run of the finished CSS passes everywhere.
 *  Levers are tried in a fixed order; each one reacts to one rule. */
export async function fix(url, config) {
  const browser = await launch();
  const found = [], where = new Map(); // found: { viewport, rules: Map<selector, Map<prop, value>> }; where: where each rule lives in the source
  try {
    // The four viewports are independent: search them at the same time, then merge in viewport order (so the result never depends on timing).
    const parts = await Promise.all(config.viewports.map(async (vp) => {
      const localWhere = new Map();
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      const cdp = await page.context().newCDPSession(page);
      const sheets = {};
      cdp.on("CSS.styleSheetAdded", (e) => { sheets[e.header.styleSheetId] = e.header; });
      await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
      await page.goto(url, { waitUntil: "networkidle" });
      await settle(page, config.settleMs);
      const rules = new Map(); // selector -> Map(prop -> value)
      const get = (sel, prop) => rules.get(sel)?.get(prop);
      const set = (sel, prop, val) => { if (!rules.has(sel)) rules.set(sel, new Map()); const r = rules.get(sel); if (r.get(prop) === val) return false; r.set(prop, val); return true; };
      const inject = async () => {
        await page.evaluate((css) => { let t = document.getElementById("lb-fix"); if (!t) { t = document.createElement("style"); t.id = "lb-fix"; document.head.appendChild(t); } t.textContent = css; }, NO_MOTION + render(rules));
        await settle(page, config.settleMs);
      };
      const count = (await getScreens(page, config)).length;
      for (let i = 0; i < count; i++) {
        for (let round = 0; round < 12; round++) {
          const s = (await getScreens(page, config))[i];
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), s.top);
          await settle(page, config.settleMs);
          const m = await measureScreen(page, config.rules, s.fit);
          if (process.env.LB_DEBUG) console.error(vp.name, s.name, round, m.findings.map((f) => f.rule + ":" + f.message).join(" | "));
          if (!m.findings.length) break;
          if (!(await lever(page, s, m, config.rules, set, get))) break;
          await inject();
        }
      }
      await page.evaluate(() => document.getElementById("lb-fix")?.remove());
      for (const [sel, props] of rules) for (const prop of props.keys()) {
        const key = sel + "|" + prop;
        if (!localWhere.has(key)) localWhere.set(key, await resolve(cdp, sheets, page.url(), sel, prop));
      }
      await page.close();
      return { entry: { viewport: vp, rules }, localWhere };
    }));
    for (const { entry, localWhere } of parts) { found.push(entry); for (const [k, v] of localWhere) if (!where.has(k)) where.set(k, v); }
  } finally { await browser.close(); }

  // First try the tidy form: elements that need the same value share the rule they already share.
  // If that breaks a screen (a shared rule also changes elements we did not need to change), give each element its own rule.
  let best = null;
  for (const strict of [false, true]) {
    const edits = toEdits(found, where, config.viewports, strict);
    const css = verifyCss(edits);
    if (process.env.LB_DEBUG) console.error("VERIFYCSS", strict, "\n" + css);
    const after = css ? await check(url, config, { css }) : await check(url, config);
    const bad = after.filter((r) => r.findings.length);
    if (!best || bad.length < best.failing.length) best = { verified: !bad.length, edits, screens: after.length, failing: bad };
    if (!bad.length) break;
  }
  return best;
}

const render = (rules) => [...rules].map(([sel, props]) => `${sel}{${[...props].map(([p, v]) => `${p}:${v}!important`).join(";")}}`).join("\n");

/** Where does `prop` of the element `sel` get its value now? The rule that wins in the cascade (strongest selector, then last), or the strongest rule that matches. */
async function resolve(cdp, sheets, pageUrl, sel, prop) {
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
  const m = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
  const attr = m.inlineStyle;
  const inAttr = async (decl) => {
    const html = (await cdp.send("DOM.getOuterHTML", { nodeId })).outerHTML, tag = html.match(/^<(?:"[^"]*"|'[^']*'|[^>"'])*>/)?.[0] ?? "";
    const at = (await cdp.send("DOM.getAttributes", { nodeId })).attributes, style = at[at.indexOf("style") + 1] ?? "";
    return { attr: true, id: "attr:" + sel, selectorText: sel, file: pageUrl, tag, style, decl: decl ? { old: decl.value } : null };
  };
  const own = attr?.range && attr.cssProperties?.find((p) => p.name === prop && p.range);
  if (own) return await inAttr(own);
  const spec = (r) => { const i = r.matchingSelectors?.[0] ?? 0, x = r.rule.selectorList.selectors[i]?.specificity ?? { a: 0, b: 0, c: 0 }; return x.a * 1e6 + x.b * 1e3 + x.c; };
  const mine = (m.matchedCSSRules || []).filter((r) => r.rule.origin === "regular" && r.rule.style.range);
  const imp = (r) => (r.rule.style.cssProperties.some((p) => p.name === prop && p.important) ? 1 : 0); // a rule that already says !important wins, so edit that one
  const pick = (list) => list.map((r, i) => ({ r, i })).sort((x, y) => imp(y.r) - imp(x.r) || spec(y.r) - spec(x.r) || y.i - x.i)[0]?.r;
  const declares = mine.filter((r) => r.rule.style.cssProperties.some((p) => p.name === prop && p.range));
  const hit = pick(declares) || pick(mine);
  if (!hit) return attr?.range ? await inAttr(null) : { none: true, sel };
  const h = sheets[hit.rule.styleSheetId] || {}, st = hit.rule.style;
  const decl = st.cssProperties.find((p) => p.name === prop && p.range);
  return {
    id: hit.rule.styleSheetId + ":" + st.range.startLine + ":" + st.range.startColumn, selectorText: hit.rule.selectorList.text,
    file: h.isInline ? pageUrl : h.sourceURL, inline: false, sheetInline: !!h.isInline, lineBase: h.isInline ? h.startLine : 0, colBase: h.isInline ? h.startColumn : 0,
    body: st.range, decl: decl ? { range: decl.range, old: decl.value, important: !!decl.important } : null,
  };
}

/** Per property of each element: the same value on every viewport is one edit of the rule; other values go into a width band under the same selector. */
function toEdits(found, where, viewports, strict) {
  const byKey = new Map();
  for (const f of found) for (const [sel, props] of f.rules) for (const [prop, val] of props) {
    const k = [sel, prop, val].join("|"); if (!byKey.has(k)) byKey.set(k, { sel, prop, val, vps: [] });
    byKey.get(k).vps.push(f.viewport);
  }
  const widths = viewports.map((v) => v.width).sort((a, b) => a - b);
  const band = (v) => {
    const i = widths.indexOf(v.width);
    const lo = i ? Math.floor((widths[i - 1] + v.width) / 2) + 1 : null, hi = i < widths.length - 1 ? Math.floor((v.width + widths[i + 1]) / 2) : null;
    return [lo != null ? `(min-width:${lo}px)` : "", hi != null ? `(max-width:${hi}px)` : ""].filter(Boolean).join(" and ");
  };
  const out = [];
  for (const e of byKey.values()) {
    if (where.get(e.sel + "|" + e.prop)?.decl?.old === e.val && !where.get(e.sel + "|" + e.prop)?.attr) continue; // the rule already says this
    const w = where.get(e.sel + "|" + e.prop);
    const bands = e.vps.length === viewports.length ? [null] : e.vps.map(band);
    for (const media of bands) out.push({ ...e, vps: undefined, media, where: w });
  }
  // Two elements that share one rule: same value = one edit of that rule; different values = each element gets its own rule (its selector is stronger).
  const groups = new Map();
  for (const e of out) { const k = [e.where.id ?? e.sel, e.prop, e.media].join("|"); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const final = [];
  for (const g of groups.values()) {
    const vals = new Set(g.map((e) => e.val)), sels = new Set(g.map((e) => e.sel));
    if (vals.size === 1 && sels.size > 1 && g[0].where.id && !strict) final.push(g[0]);
    else if (sels.size === 1 && !strict) final.push(...new Map(g.map((e) => [e.sel + e.val, e])).values());
    else final.push(...g.map((e) => ({ ...e, where: { ...e.where, own: strict || sels.size > 1 } })));
  }
  return final;
}

/** The finished edits as CSS for the last check. Same selector as the rule that wins, no !important: it does exactly what editing that rule does. */
function verifyCss(edits) {
  return edits.map((e) => {
    const w = e.where, sel = w.own ? e.sel : w.selectorText || e.sel, bang = w.attr || w.none ? "!important" : "";
    const keep = w.decl?.important && !w.attr ? "!important" : bang; // only an !important the page already has is kept
    const rule = `${w.attr || w.none ? e.sel : sel}{${e.prop}:${e.val}${keep}}`;
    return e.media ? `@media ${e.media}{${rule}}` : rule;
  }).join("\n");
}

/** One step: look at the first failing rule and set CSS for it. Returns false when there is nothing new to try. */
async function lever(page, s, m, R, set, get) {
  const { data, weight } = m, rule = (r) => m.findings.some((f) => f.rule === r), H = data.H;
  const space = H - data.headerBottom, S = s.css;
  const content = data.leaves.filter((l) => !l.fixed);
  let changed = false; const go = (...a) => { if (set(...a)) { changed = true; if (process.env.LB_DEBUG) console.error("   set", a.join(" | ")); } };

  // 1. sides
  if (rule("edge-touch") || rule("edge-cut") || rule("overflow-x")) {
    go(S, "box-sizing", "border-box"); go(S, "padding-inline", `max(${R.minEdge + 4}px,4vw)`);
    for (const l of content.filter((l) => l.x < -1 || l.x + l.w > data.W + 1)) { go(l.css, "max-width", "100%"); go(l.css, "overflow-wrap", "anywhere"); if (l.kind === "text") go(l.css, "white-space", "normal"); }
    if (changed) return true;
    // the section padding was not enough (the text sits in a box of its own): first push that text in with a margin, then pad the box that holds it
    for (const l of content.filter((l) => l.kind === "text" && (l.x < R.minEdge || data.W - l.x - l.w < R.minEdge))) {
      const left = l.x < R.minEdge, right = data.W - l.x - l.w < R.minEdge, need = R.minEdge + 4;
      const prop = left ? "margin-left" : "margin-right";
      if (get(l.css, prop) === undefined) {
        const mg = await page.evaluate((q) => { const c = getComputedStyle(document.querySelector(q)); return [parseFloat(c.marginLeft) || 0, parseFloat(c.marginRight) || 0]; }, l.css);
        if (left) go(l.css, "margin-left", `${Math.ceil(mg[0] + need - l.x)}px`);
        if (right) go(l.css, "margin-right", `${Math.ceil(mg[1] + need - (data.W - l.x - l.w))}px`);
      } else {
        const box = await page.evaluate((q) => window.__lbUniq(document.querySelector(q).parentElement), l.css);
        go(box, "box-sizing", "border-box"); go(box, left ? "padding-left" : "padding-right", `${need}px`);
      }
    }
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
        const was = parseFloat(get(b.css, "margin-top")); // set before and still short: the neighbour moves with it (centred, wrapped), so step up
        go(b.css, "margin-top", `${Math.round((Number.isFinite(was) ? was : mt) + Math.ceil(R.minGap - gap) * (Number.isFinite(was) ? 2 : 1))}px`);
        if (changed) return true;
      }
    }
  }
  // 4. too tall: shrink the tallest picture, then the section padding
  const top = Math.min(...content.map((l) => l.y)), bottom = Math.max(...content.map((l) => l.y + l.h));
  const over = bottom - (H - Math.ceil(R.minTopClearance * H) - 1);
  if (over > 0 && (rule("fold-cut") || rule("bottom-clearance"))) {
    if (media && media.h - over >= H * 0.12) { const svh = Math.floor((media.h - over) / H * 1000) / 10; go(media.css, "max-height", `${svh}svh`); go(media.css, "height", `${svh}svh`); go(media.css, "object-fit", "contain"); if (changed) return true; }
    go(S, "padding-block", "2svh"); if (changed) return true;
    // still too tall: make the biggest text smaller, by the share it has to give back (never under 14px)
    const t = content.filter((l) => l.kind === "text").sort((a, b) => b.h - a.h)[0];
    if (t) {
      const f = await page.evaluate((q) => parseFloat(getComputedStyle(document.querySelector(q)).fontSize), t.css), n = Math.max(14, Math.floor(f * (1 - Math.min(0.5, over / t.h))));
      if (n < f) { go(t.css, "font-size", `${n}px`); if (changed) return true; }
    }
  }
  // 5. centre the block: equal space above and below, and the weight in the middle
  const base = ["whitespace-tilt", "top-clearance", "bottom-clearance", "centre-y", "centre-x", "fold-cut"].some(rule);
  if (base) {
    go(S, "display", "flex"); go(S, "flex-direction", "column"); go(S, "justify-content", "center"); go(S, "align-items", "center");
    go(S, "box-sizing", "border-box"); go(S, "min-height", "100svh"); go(S, "text-align", "center");
    const clear = Math.ceil(R.minTopClearance * H) + 2; // never closer to a bar or an edge than the rule allows
    go(S, "padding-top", `${Math.ceil(data.headerBottom) + clear}px`); go(S, "padding-bottom", `${clear}px`);
    if (changed) return true;
  }
  if (rule("centre-x") && weight) {
    const heavy = content.filter((l) => l.kind !== "text").sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (heavy) { go(heavy.css, "margin-inline", "auto"); if (changed) return true; }
  }
  void weight; void top;
  return false;
}
