import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { collect } from "./collect.js";
import { evaluate } from "./rules.js";
import { weightCentre, drawReport } from "./weight.js";
import { plan } from "./plan.js";
import { uniq } from "./uniq.js";

export { evaluate, weightCentre, drawReport, plan };
const here = dirname(fileURLToPath(import.meta.url));

export function loadConfig(path) {
  const base = JSON.parse(readFileSync(join(here, "..", "balance.config.json"), "utf8"));
  const file = path ?? (existsSync("balance.config.json") ? "balance.config.json" : null);
  if (!file) return base;
  const user = JSON.parse(readFileSync(file, "utf8"));
  return { ...base, ...user, rules: { ...base.rules, ...user.rules } };
}

export async function launch() {
  try { return await chromium.launch({ channel: "chrome" }); } catch { return await chromium.launch(); }
}

/** Measure what is on screen right now in `page`. `fit`: this screen is meant to fit in one window. */
export async function measureScreen(page, rules, fit) {
  const data = await page.evaluate(collect);
  const shot = await page.screenshot();
  const content = data.leaves.filter((l) => !l.fixed);
  const weight = fit && content.length ? weightCentre(shot, { W: data.W, top: data.headerBottom, bottom: data.H }) : null;
  return { data, weight, findings: evaluate({ data, weight, fit }, rules) };
}

export const NO_MOTION = "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}\n";

/** The screens of the page right now: one per section (or the whole page). Each has a unique CSS selector, `css`. */
export async function getScreens(page, config) {
  await page.evaluate(`window.__lbUniq = ${uniq}`);
  const tops = await page.evaluate((sel) => {
    const list = [...document.querySelectorAll(sel)].filter((s) => !s.parentElement.closest(sel));
    const H = innerHeight;
    return list.map((s, i) => {
      const r = s.getBoundingClientRect();
      const sticky = [...s.querySelectorAll("*")].some((e) => getComputedStyle(e).position === "sticky" && e.getBoundingClientRect().height >= H * 0.9);
      return { name: s.id || s.getAttribute("aria-label") || `section-${i + 1}`, css: window.__lbUniq(s), top: r.top + scrollY, fit: r.height <= H * 1.15 || sticky };
    });
  }, config.sections);
  return tops.length ? tops : [{ name: "page", css: "body", top: 0, fit: await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight * 1.15) }];
}

export async function check(url, config = loadConfig(), { outDir, withPlan, css } = {}) {
  const browser = await launch();
  const results = [];
  try {
    for (const vp of config.viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: "networkidle" });
      if (css) await page.addStyleTag({ content: NO_MOTION + css });
      await page.waitForTimeout(config.settleMs);
      const screens = await getScreens(page, config);
      for (const s of screens) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), s.top);
        await page.waitForTimeout(config.settleMs);
        const m = await measureScreen(page, config.rules, s.fit);
        if (outDir && m.weight && !m.weight.empty) {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(join(outDir, `${vp.name}-${s.name}.png`), drawReport(m.weight));
        }
        results.push({ viewport: vp.name, size: `${vp.width}x${vp.height}`, section: s.name, fit: s.fit, findings: m.findings, ...(withPlan && m.findings.length ? { plan: plan({ data: m.data, weight: m.weight, fit: s.fit }, config.rules, m.findings) } : {}) });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  return results;
}
