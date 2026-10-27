import { PNG } from "pngjs";

/** Visual weight of a screenshot: how far each pixel is from the page's usual (background) brightness. Returns the centre of weight inside a region. */
export function weightCentre(pngBuffer, region) {
  const png = PNG.sync.read(pngBuffer);
  const { width, height, data } = png;
  const scale = width / region.W;
  const y0 = Math.round(region.top * scale), y1 = Math.min(height, Math.round(region.bottom * scale));
  const lum = (i) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  const hist = new Array(32).fill(0);
  for (let y = y0; y < y1; y += 2) for (let x = 0; x < width; x += 2) hist[Math.min(31, Math.floor(lum((y * width + x) * 4) * 32))]++;
  const bg = (hist.indexOf(Math.max(...hist)) + 0.5) / 32;
  let sum = 0, sx = 0, sy = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < width; x++) {
    const d = Math.abs(lum((y * width + x) * 4) - bg);
    if (d < 0.06) continue;
    sum += d; sx += d * x; sy += d * y;
  }
  const cw = width, ch = y1 - y0;
  if (!sum) return { empty: true, dx: 0, dy: 0, cx: 0.5, cy: 0.5, png, scale, y0, y1 };
  const cx = sx / sum / cw, cy = (sy / sum - y0) / ch;
  return { empty: false, cx, cy, dx: cx - 0.5, dy: cy - 0.5, png, scale, y0, y1 };
}

/** Draw the proof: the middle of the region (white) and the centre of weight (red). */
export function drawReport(w) {
  const { png, cx, cy, scale, y0, y1 } = w;
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= png.width || y >= png.height) return; const i = (y * png.width + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255; };
  const cross = (x, y, r, c) => { for (let t = -r; t <= r; t++) for (let k = -1; k <= 1; k++) { set(x + t, y + k, c); set(x + k, y + t, c); } };
  cross(png.width / 2, (y0 + y1) / 2, 18 * scale, [255, 255, 255]);
  cross(cx * png.width, y0 + cy * (y1 - y0), 18 * scale, [255, 59, 48]);
  return PNG.sync.write(png);
}
