import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const at = (w, pos) => ({ line: w.lineBase + pos.startLine, col: pos.startColumn + (pos.startLine === 0 ? w.colBase : 0) });
const endAt = (w, pos) => ({ line: w.lineBase + pos.endLine, col: pos.endColumn + (pos.endLine === 0 ? w.colBase : 0) });
const offset = (text, { line, col }) => { let o = 0; for (let i = 0; i < line; i++) o = text.indexOf("\n", o) + 1; return o + col; };
const name = (url) => { try { const u = new URL(url); return u.pathname === "/" ? "(the page)" : u.pathname.replace(/^\//, ""); } catch { return url; } };

/** Human lines: where to change what. One line per edit, with file:line when it is known. */
export function describe(edits) {
  const lines = edits.map((e) => {
    const w = e.where, band = e.media ? ` only at ${e.media}` : "";
    if (w.none) return `${e.sel}: no rule matches it yet: add a rule that sets ${e.prop}: ${e.val}${band}`;
    if (w.attr) return `${name(w.file)}  ${e.sel} style="": ${w.decl ? `${e.prop}: ${w.decl.old} -> ${e.val}` : `add ${e.prop}: ${e.val}`}`;
    const line = at(w, w.decl ? w.decl.range : w.body).line + 1, where = `${name(w.file)}:${line}  ${w.selectorText}`;
    if (w.own) return `${where}: new rule after it for ${e.sel}${e.media ? ` (@media ${e.media})` : ""}: ${e.prop}: ${e.val}`;
    if (e.media) return `${where}: new rule after it, @media ${e.media} { ${w.selectorText} { ${e.prop}: ${e.val} } }`;
    return w.decl ? `${where}: ${e.prop}: ${w.decl.old} -> ${e.val}` : `${where}: add ${e.prop}: ${e.val}`;
  });
  return lines; 
}

/** Write the edits into the files under `dir` (plain .css files, or <style> in the .html page). Returns what it could not write. */
export function write(edits, dir) {
  const byFile = new Map(), manual = [];
  const local = (url) => { try { const p = new URL(url).pathname; const f = join(dir, p.endsWith("/") ? p + "index.html" : p); return existsSync(f) ? f : null; } catch { return null; } };
  for (const e of edits) {
    const w = e.where, f = !w.none && !(w.attr && e.media) && local(w.file);
    if (!f) { manual.push(e); continue; }
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(e);
  }
  const written = [];
  for (const [f, list] of byFile) {
    let text = readFileSync(f, "utf8");
    const ops = []; // { start, end, text } on the original text
    const inserts = new Map(); // offset -> text
    const ins = (o, t) => inserts.set(o, (inserts.get(o) || "") + t);
    const blocks = new Map(); // rule end + band -> declarations
    const tags = new Map(); // opening tag text -> { style, set }
    for (const e of list) {
      const w = e.where;
      if (w.attr) { if (!tags.has(w.tag)) tags.set(w.tag, { style: w.style, set: new Map() }); tags.get(w.tag).set.set(e.prop, e.val); continue; }
      const ruleEnd = offset(text, endAt(w, w.body));
      if (e.media || w.own) { const k = ruleEnd + "|" + e.media + "|" + (w.own ? e.sel : w.selectorText); if (!blocks.has(k)) blocks.set(k, { ruleEnd, e, decls: [] }); blocks.get(k).decls.push(`${e.prop}:${e.val}`); }
      else if (w.decl) { const s = offset(text, at(w, w.decl.range)), x = offset(text, endAt(w, w.decl.range)); ops.push({ start: s, end: x, text: `${e.prop}: ${e.val}${w.decl.important ? " !important" : ""}${text.slice(s, x).trimEnd().endsWith(";") ? ";" : ""}` }); }
      else { const body = text.slice(offset(text, at(w, w.body)), ruleEnd), keep = body.trimEnd(), o = offset(text, at(w, w.body)) + keep.length; ins(o, `${keep && !keep.endsWith(";") && !inserts.has(o) ? ";" : ""} ${e.prop}: ${e.val};`); }
    }
    for (const [tag0, { style, set }] of tags) {
      // Chrome writes < > & in attribute values as entities; the file may have them raw. Try the raw form when the first is not found.
      const raw = tag0.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), tag = text.includes(tag0) ? tag0 : raw;
      const start = text.indexOf(tag), m = tag.match(/style=(["'])(.*?)\1/s);
      if (!tag || start < 0 || text.indexOf(tag, start + 1) >= 0 || !m) { manual.push(...list.filter((e) => e.where.tag === tag0)); continue; } // not found, or twice: do not guess
      const parts = style.split(";").map((x) => x.trim()).filter(Boolean).filter((x) => !set.has(x.split(":")[0].trim().toLowerCase()));
      const next = [...parts, ...[...set].map(([k, v]) => `${k}: ${v}`)].join("; ");
      ops.push({ start: start + m.index, end: start + m.index + m[0].length, text: `style=${m[1]}${next}${m[1]}` });
    }
    for (const { ruleEnd, e, decls } of blocks.values()) ins(ruleEnd + 1, e.media ? `\n@media ${e.media} { ${e.where.own ? e.sel : e.where.selectorText} { ${decls.join("; ")} } }` : `\n${e.sel} { ${decls.join("; ")} }`);
    for (const [o, t] of inserts) ops.push({ start: o, end: o, text: t });
    ops.sort((a, b) => b.start - a.start || b.end - a.end);
    for (const op of ops) text = text.slice(0, op.start) + op.text + text.slice(op.end);
    writeFileSync(f, text); written.push(f);
  }
  return { written, manual };
}
