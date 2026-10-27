import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { evaluate, loadConfig, weightCentre, drawReport } from "./index.js";

const run = promisify(execFile);
const IOS = join(dirname(fileURLToPath(import.meta.url)), "..", "ios");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// XCUIElement.ElementType raw values
const T = { button: 9, image: 43, icon: 44, staticText: 48, textField: 49, textView: 52, navBar: 21, tabBar: 22, toolbar: 24, statusBar: 25, map: 57, webView: 58, cell: 75 };

/** Pure: the accessibility tree (points) + screenshot scale -> the same data shape the web collector returns (pixels). */
export function parseSnapshot(tree, scale = 1) {
  const [, , aw, ah] = tree.f, W = Math.round(aw * scale), H = Math.round(ah * scale);
  const leaves = [], bars = [];
  const walk = (n, inBar) => {
    const [fx, fy, fw, fh] = n.f.map((v) => v * scale), x = Math.round(fx), y = Math.round(fy), w = Math.round(fw), h = Math.round(fh);
    const label = (n.label || n.value || "").trim();
    const isBar = [T.navBar, T.tabBar, T.toolbar, T.statusBar].includes(n.t);
    if (isBar && w > 0 && h > 0) bars.push({ x, y, w, h });
    let kind = null;
    if ([T.staticText, T.textField, T.textView].includes(n.t) && label) kind = "text";
    else if (n.t === T.button && label && !n.k.length) kind = "text";
    else if ([T.image, T.icon, T.map].includes(n.t)) kind = "media";
    else if (!n.k.length && w >= 24 * scale && h >= 24 * scale && !label && !(w >= W * 0.95 && h >= H * 0.95)) kind = "box";
    const onScreen = y < H && y + h > 0 && x < W && x + w > 0;
    if (kind && w > 1 && h > 1 && onScreen) leaves.push({ kind, x, y, w, h, fixed: inBar || isBar, tag: "ios" + n.t });
    n.k.forEach((c) => walk(c, inBar || isBar));
  };
  walk(tree, false);
  const top = bars.filter((b) => b.y <= 1 && b.h < H * 0.25 && b.w >= W * 0.5);
  const bottom = bars.filter((b) => b.y + b.h >= H - 1 && b.h < H * 0.25 && b.w >= W * 0.5 && b.y > H * 0.5);
  const headerBottom = top.length ? Math.max(...top.map((b) => b.y + b.h)) : 0;
  const footerTop = bottom.length ? Math.min(...bottom.map((b) => b.y)) : H;
  return { W, H: footerTop, headerBottom, leaves, hscroll: false };
}

const pngWidth = (buf) => buf.readUInt32BE(16);

async function pickDevice(udid) {
  const { stdout } = await run("xcrun", ["simctl", "list", "devices", "-j"]);
  const all = Object.values(JSON.parse(stdout).devices).flat();
  if (udid) return udid;
  const booted = all.find((d) => d.state === "Booted");
  if (booted) return booted.udid;
  const first = all.find((d) => d.isAvailable && /^iPhone/.test(d.name));
  if (!first) throw new Error("no iPhone simulator found (open Xcode > Settings > Components)");
  await run("xcrun", ["simctl", "boot", first.udid]);
  return first.udid;
}

/** One long-running XCUITest process that answers snapshot requests. Build once, then each screen takes about a second. */
export async function startRunner(udid) {
  const dd = join(homedir(), ".cache", "layout-balance", "ios-build");
  const built = join(dd, "Build", "Products");
  if (!existsSync(built)) {
    mkdirSync(dd, { recursive: true });
    await run("xcodebuild", ["build-for-testing", "-project", join(IOS, "LBRunner.xcodeproj"), "-scheme", "LBRunner", "-destination", `id=${udid}`, "-derivedDataPath", dd, "-quiet"], { maxBuffer: 1 << 26 });
  }
  const dir = join(tmpdir(), `lb-ios-${process.pid}`);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const child = spawn("xcodebuild", ["test-without-building", "-project", join(IOS, "LBRunner.xcodeproj"), "-scheme", "LBRunner", "-destination", `id=${udid}`, "-derivedDataPath", dd, "-quiet"],
    { env: { ...process.env, TEST_RUNNER_LB_DIR: dir }, stdio: "ignore" });
  let dead = false; child.on("exit", () => { dead = true; });
  for (let i = 0; !existsSync(join(dir, "ready")); i++) { if (dead || i > 2400) throw new Error("the iOS runner did not start"); await sleep(25); }
  let n = 0;
  return {
    async snapshot(bundle) {
      writeFileSync(join(dir, `req-${n}.json`), JSON.stringify({ bundle }));
      const res = join(dir, `res-${n}.json`); n++;
      for (let i = 0; !existsSync(res); i++) { if (dead || i > 3000) throw new Error("the iOS runner stopped answering"); await sleep(25); }
      const tree = JSON.parse(readFileSync(res, "utf8"));
      if (tree.error) throw new Error(`${tree.error} (${bundle}): open the screen first, or add "start" to the screen`);
      return tree;
    },
    async close() { writeFileSync(join(dir, "quit"), ""); await sleep(200); child.kill(); rmSync(dir, { recursive: true, force: true }); },
  };
}

/** screens: [{ name, bundle, start?: "shell command to open it, e.g. xcrun simctl openurl booted myapp://home", waitMs?, fit? }] */
export async function checkIOS(screens, config = loadConfig(), { udid, outDir } = {}) {
  const dev = await pickDevice(udid), runner = await startRunner(dev), results = [];
  try {
    for (const s of screens) {
      if (s.start) await run("sh", ["-c", s.start]);
      await sleep(s.waitMs ?? 1000);
      const tree = await runner.snapshot(s.bundle);
      const png = join(tmpdir(), `lb-ios-shot-${process.pid}.png`);
      await run("xcrun", ["simctl", "io", dev, "screenshot", "--type=png", png]);
      const shot = readFileSync(png); rmSync(png, { force: true });
      const scale = pngWidth(shot) / tree.f[2], data = parseSnapshot(tree, scale), fit = s.fit ?? true;
      const rules = { ...config.rules, minGap: config.rules.minGap * scale, minEdge: config.rules.minEdge * scale };
      const content = data.leaves.filter((l) => !l.fixed);
      const weight = fit && content.length ? weightCentre(shot, { W: data.W, top: data.headerBottom, bottom: data.H }) : null;
      if (outDir && weight && !weight.empty) { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, `ios-${s.name}.png`), drawReport(weight)); }
      results.push({ viewport: "ios", size: `${data.W}x${data.H}`, section: s.name, fit, findings: evaluate({ data, weight, fit }, rules) });
    }
  } finally { await runner.close(); }
  return results;
}
