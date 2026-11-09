// Runs inside the page. Returns plain numbers only: where things are, not what they mean.
export function collect() {
  const W = innerWidth, H = innerHeight;
  const fixedRoots = [];
  const all = [...document.body.querySelectorAll("*")];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if ((cs.position === "fixed" || cs.position === "sticky") && el.getBoundingClientRect().height < H * 0.9) fixedRoots.push(el);
  }
  const inFixed = (el) => fixedRoots.some((f) => f === el || f.contains(el));

  let headerBottom = 0;
  for (const f of fixedRoots) {
    const r = f.getBoundingClientRect();
    if (r.top <= 1 && r.width >= W * 0.5 && r.height < H * 0.25) headerBottom = Math.max(headerBottom, r.bottom);
  }

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return false;
    for (let p = el.parentElement; p; p = p.parentElement) if (parseFloat(getComputedStyle(p).opacity) < 0.05) return false;
    return true;
  };
  const path = (el) => {
    const parts = [];
    for (let e = el, n = 0; e && e !== document.body && n < 2; e = e.parentElement, n++) {
      if (e.id) { parts.unshift("#" + e.id); break; }
      const cls = [...e.classList].slice(0, 2).map((c) => "." + CSS.escape(c)).join("");
      parts.unshift(e.tagName.toLowerCase() + cls);
    }
    return parts.join(" > ").slice(0, 80);
  };
  const uq = (el) => (window.__lbUniq || path)(el);
  const absMap = new Map(), absolute = (el) => { if (!el || el === document.body) return false; if (!absMap.has(el)) absMap.set(el, getComputedStyle(el).position === "absolute" || absolute(el.parentElement)); return absMap.get(el); }; // placed by hand: not part of the flow of blocks
  const uqCache = new Map(), uqOf = (el) => { if (!uqCache.has(el)) uqCache.set(el, uq(el)); return uqCache.get(el); };
  const NOT_BLOCK = ["inline", "contents", "none"]; // everything else (block, flex, grid, list-item, inline-block, a button) stands on its own
  const boxOf = new Map(); // element -> index in `boxes`
  const boxes = [];
  const leafEls = []; // the element of each leaf, same order as `leaves`
  const leaves = [];
  const push = (kind, r, el, extra) => {
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) return;
    const vis = (Math.min(r.right, W) - Math.max(r.left, 0)) * (Math.min(r.bottom, H) - Math.max(r.top, 0));
    if (kind !== "text" && vis < r.width * r.height * 0.25) return; // mostly off screen: it belongs to the next screen
    const cs = getComputedStyle(el), media = kind === "media";
    // block: a piece that stands on its own line (not a span/link inside a paragraph); parent: the element that holds it
    const leaf = { sel: path(el), css: uqOf(el), kind, x: r.left, y: r.top, w: r.width, h: r.height, fixed: inFixed(el), tag: el.tagName.toLowerCase(), block: !absolute(el) && (media || !NOT_BLOCK.includes(cs.display)), parent: el.parentElement && el.parentElement !== document.body ? uqOf(el.parentElement) : "body", ...extra };
    leaves.push(leaf); leafEls.push(el);
  };
  for (const el of all) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName) || !visible(el)) continue;
    const textNodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (textNodes.length) {
      const range = document.createRange();
      range.setStartBefore(textNodes[0]); range.setEndAfter(textNodes[textNodes.length - 1]);
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 16, lh = cs.lineHeight === "normal" ? fs * 1.2 : parseFloat(cs.lineHeight) || fs * 1.2;
      const line1 = range.getClientRects()[0]?.height || lh; // the line box is taller than the glyph box by half the leading on each side
      push("text", range.getBoundingClientRect(), el, { chars: textNodes.map((n) => n.textContent.trim()).join(" ").length, lineH: lh, align: cs.textAlign, ext: cs.lineHeight === "normal" ? 0 : Math.max(0, (lh - line1) / 2) });
    }
    const tag = el.tagName;
    if (["IMG", "CANVAS", "VIDEO", "PICTURE"].includes(tag) || (tag === "SVG" || tag === "svg") && !el.closest("svg:not(:scope)")) {
      if (!el.closest('[aria-hidden="true"]')) push("media", el.getBoundingClientRect(), el); // decorative overlays do not count
    } else if (el.children.length && !textNodes.length) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const alpha = (cs.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(",")[3] ?? "1").trim();
      const painted = (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && parseFloat(alpha) > 0.05) || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0; // gradients and images count too
      if (painted && r.width >= 48 && r.height >= 48 && r.height < H * 0.95 && r.width < W * 0.99) push("panel", r, el); // cards and boxes: the eye sees them even when empty
    } else if (!el.children.length && !textNodes.length) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const painted = cs.backgroundImage !== "none" || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") || parseFloat(cs.borderTopWidth) > 0;
      if (painted && r.width >= 24 && r.height >= 24) push("box", r, el);
    }
  }
  // Painted boxes (cards, buttons, panels) and what sits inside each: the pieces above forget which box holds them.
  const painted = (cs) => {
    const alpha = parseFloat((cs.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(",")[3] ?? "1").trim());
    return (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent" && alpha > 0.05) || cs.backgroundImage !== "none" || ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(cs["border" + s + "Width"]) > 0) || cs.boxShadow !== "none";
  };
  const four = (cs, pre, post) => ["Top", "Right", "Bottom", "Left"].map((s) => parseFloat(cs[pre + s + post]) || 0);
  for (const el of all) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SECTION", "svg", "SVG", "IMG", "PICTURE", "CANVAS", "VIDEO"].includes(el.tagName) || el.closest("svg") || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.display === "contents" || !painted(cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 16 || r.width > W * 0.99 || r.right <= 0 || r.left >= W || r.bottom <= 0 || r.top >= H) continue;
    if ((Math.min(r.right, W) - Math.max(r.left, 0)) * (Math.min(r.bottom, H) - Math.max(r.top, 0)) < r.width * r.height * 0.5) continue;
    boxOf.set(el, boxes.length);
    const flexCol = cs.flexDirection.startsWith("column"), disp = cs.display;
    const centred = cs.textAlign === "center" || (/flex/.test(disp) && (flexCol ? cs.alignItems === "center" : cs.justifyContent === "center")) || (/grid/.test(disp) && (cs.justifyItems === "center" || cs.justifyContent === "center"))
      || ["BUTTON"].includes(el.tagName) || el.getAttribute("role") === "button" || (el.tagName === "INPUT" && ["button", "submit"].includes(el.type)) || disp === "inline-block" || disp === "inline-flex" || disp === "inline-grid";
    // the margin under the last child sits inside the box when the box has padding: it makes the bottom space bigger
    let lastMarginBottom = 0, lastCss = null;
    for (let cur = el, d = 0; d < 3; d++) {
      const k = [...cur.children].filter((c) => !["SCRIPT", "STYLE"].includes(c.tagName) && visible(c) && ["static", "relative", "sticky"].includes(getComputedStyle(c).position)).pop();
      if (!k) break;
      const kc = getComputedStyle(k), m = parseFloat(kc.marginBottom) || 0;
      if (m > 0) { lastMarginBottom = m; lastCss = uqOf(k); break; }
      if (parseFloat(kc.paddingBottom) || parseFloat(kc.borderBottomWidth)) break;
      cur = k;
    }
    boxes.push({ css: uqOf(el), tag: el.tagName.toLowerCase(), x: r.left, y: r.top, w: r.width, h: r.height, pad: four(cs, "padding", ""), border: four(cs, "border", "Width"), content: null, centred, stretched: false, lastMarginBottom, lastCss, parent: el.parentElement && el.parentElement !== document.body ? uqOf(el.parentElement) : "body", display: disp, el });
  }
  // content of a box = union of every piece inside it (and every box inside it); pieces that float out of the flow do not count
  const grow = (b, x0, y0, x1, y1) => { const c = b.content; b.content = c ? { x: Math.min(c.x, x0), y: Math.min(c.y, y0), w: Math.max(c.x + c.w, x1) - Math.min(c.x, x0), h: Math.max(c.y + c.h, y1) - Math.min(c.y, y0) } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const climb = (el, x0, y0, x1, y1) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (boxOf.has(p) && p !== el) grow(boxes[boxOf.get(p)], x0, y0, x1, y1);
      if (["absolute", "fixed"].includes(getComputedStyle(p).position)) break;
    }
  };
  leaves.forEach((l, i) => {
    const el = leafEls[i];
    const self = l.kind === "text" || l.kind === "media";
    l.box = -1;
    for (let p = self ? el : el.parentElement; p && p !== document.body; p = p.parentElement) if (boxOf.has(p)) { l.box = boxOf.get(p); break; }
    const e = l.ext || 0;
    if (self && boxOf.has(el)) grow(boxes[boxOf.get(el)], l.x, l.y - e, l.x + l.w, l.y + l.h + e);
    climb(el, l.x, l.y - e, l.x + l.w, l.y + l.h + e);
  });
  for (const b of boxes) climb(b.el, b.x, b.y, b.x + b.w, b.y + b.h);
  // buttons and links count with their whole area even when nothing is painted (a tab bar where only one tab has a background)
  for (const el of all) {
    if (!["BUTTON", "A", "SELECT", "INPUT"].includes(el.tagName) && !["button", "tab"].includes(el.getAttribute("role")) || boxOf.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || !visible(el) || ["inline", "contents"].includes(getComputedStyle(el).display)) continue;
    climb(el, r.left, r.top, r.right, r.bottom);
  }
  for (const b of boxes) {
    const c = b.content;
    b.stretched = !!c && b.h > c.h + b.pad[0] + b.pad[2] + b.border[0] + b.border[2] + 4;
    delete b.el;
  }
  return { W, H, headerBottom, leaves, boxes, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
}
