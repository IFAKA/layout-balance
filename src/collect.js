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
  const leaves = [];
  const push = (kind, r, el) => {
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) return;
    const vis = (Math.min(r.right, W) - Math.max(r.left, 0)) * (Math.min(r.bottom, H) - Math.max(r.top, 0));
    if (kind !== "text" && vis < r.width * r.height * 0.25) return; // mostly off screen: it belongs to the next screen
    leaves.push({ sel: path(el), kind, x: r.left, y: r.top, w: r.width, h: r.height, fixed: inFixed(el), tag: el.tagName.toLowerCase() });
  };
  for (const el of all) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName) || !visible(el)) continue;
    const textNodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (textNodes.length) {
      const range = document.createRange();
      range.setStartBefore(textNodes[0]); range.setEndAfter(textNodes[textNodes.length - 1]);
      push("text", range.getBoundingClientRect(), el);
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
  return { W, H, headerBottom, leaves, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
}
