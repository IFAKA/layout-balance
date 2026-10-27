import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { evaluate, loadConfig, weightCentre, drawReport } from "./index.js";

const run = promisify(execFile);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (name) => name === "node" });

/** Pure: uiautomator XML + screen size -> the same data shape the web collector returns. */
export function parseUiXml(xml, W, H) {
  const tree = parser.parse(xml.slice(0, xml.lastIndexOf("</hierarchy>") + 12));
  const leaves = [];
  const bars = [];
  const walk = (node) => {
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(node.bounds || "");
    const kids = node.node || [];
    if (b) {
      const [x, y, r, bt] = [+b[1], +b[2], +b[3], +b[4]], w = r - x, h = bt - y;
      const system = node.package === "com.android.systemui";
      const cls = node.class || "";
      const text = (node.text || node["content-desc"] || "").trim();
      let kind = null;
      if (node.text && String(node.text).trim()) kind = "text";
      else if (/ImageView|ImageButton|VideoView|SurfaceView/.test(cls)) kind = "media";
      else if (!kids.length && w >= 24 && h >= 24 && !text) kind = "box";
      if (system && w > 0 && h > 0) bars.push({ x, y, w, h });
      if (kind && w > 1 && h > 1 && y < H && y + h > 0) leaves.push({ kind, x, y, w, h, fixed: system, tag: cls.split(".").pop().toLowerCase() || "view" });
    }
    kids.forEach(walk);
  };
  (tree.hierarchy?.node || []).forEach(walk);
  const top = bars.filter((b) => b.y <= 1 && b.h < H * 0.25 && b.w >= W * 0.5);
  const bottom = bars.filter((b) => b.y + b.h >= H - 1 && b.h < H * 0.25 && b.w >= W * 0.5 && b.y > H * 0.5);
  const headerBottom = top.length ? Math.max(...top.map((b) => b.y + b.h)) : 0;
  const footerTop = bottom.length ? Math.min(...bottom.map((b) => b.y)) : H;
  return { W, H: footerTop, headerBottom, leaves, hscroll: false };
}

const adbArgs = (serial, args) => (serial ? ["-s", serial, ...args] : args);
const adb = (serial, args, opts = {}) => run("adb", adbArgs(serial, args), { maxBuffer: 64 * 1024 * 1024, ...opts });

export async function measureAndroid({ serial, rules, fit = true }) {
  const size = /(\d+)x(\d+)/.exec((await adb(serial, ["shell", "wm", "size"])).stdout);
  const dens = /(\d+)/.exec((await adb(serial, ["shell", "wm", "density"])).stdout);
  const [W, H] = [+size[1], +size[2]], density = +dens[1] / 160;
  const xml = (await adb(serial, ["exec-out", "uiautomator", "dump", "/dev/tty"])).stdout;
  const shot = (await adb(serial, ["exec-out", "screencap", "-p"], { encoding: "buffer" })).stdout;
  const data = parseUiXml(xml, W, H);
  const scaled = { ...rules, minGap: rules.minGap * density, minEdge: rules.minEdge * density };
  const content = data.leaves.filter((l) => !l.fixed);
  const weight = fit && content.length ? weightCentre(shot, { W, top: data.headerBottom, bottom: data.H }) : null;
  return { data, weight, findings: evaluate({ data, weight, fit }, scaled) };
}

/** screens: [{ name, start?: "adb shell command to open it", waitMs?, fit? }] */
export async function checkAndroid(screens, config = loadConfig(), { serial, outDir } = {}) {
  const results = [];
  for (const s of screens) {
    if (s.start) await run("sh", ["-c", s.start]);
    await new Promise((r) => setTimeout(r, s.waitMs ?? 1500));
    const m = await measureAndroid({ serial, rules: config.rules, fit: s.fit ?? true });
    if (outDir && m.weight && !m.weight.empty) { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, `android-${s.name}.png`), drawReport(m.weight)); }
    results.push({ viewport: "android", size: `${m.data.W}x${m.data.H}`, section: s.name, fit: s.fit ?? true, findings: m.findings });
  }
  return results;
}
