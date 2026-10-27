/** Runs in the page. A short CSS selector that matches exactly this element (id, a unique class, or the nth-of-type path). */
export function uniq(el) {
  const one = (q) => { try { return document.querySelectorAll(q).length === 1; } catch { return false; } };
  const parts = [];
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    if (e === document.body) { parts.unshift("body"); break; }
    const tag = e.tagName.toLowerCase();
    if (e.id && one("#" + CSS.escape(e.id))) { parts.unshift("#" + CSS.escape(e.id)); break; }
    const cls = [...e.classList].map((c) => tag + "." + CSS.escape(c)).find(one);
    if (cls) { parts.unshift(cls); break; }
    const i = [...e.parentElement.children].filter((c) => c.tagName === e.tagName).indexOf(e) + 1;
    parts.unshift(`${tag}:nth-of-type(${i})`);
  }
  return parts.join(" > ");
}
