import jsQR from 'jsqr';
import { loadSvgImage, qrSvgMarkup } from '@/lib/qr-svg';

export interface QrArea { x: number; y: number; size: number }
export type LogoStyle = 'none' | 'google' | 'instagram' | 'whatsapp';
export interface Detection { area: QrArea; modules: number | null }

const MAX_PIXELS = 100_000_000;
export function assertImageSize(img: HTMLImageElement) {
  if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) throw new Error('Imagem muito grande');
}
export function loadImageFile(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Erro ao ler imagem')); };
    img.src = url;
  });
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }

export async function detectQrArea(img: HTMLImageElement): Promise<Detection | null> {
  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  for (const maxDim of [1600, 1000, 2400, 700, 3200]) {
    const scale = Math.min(1, maxDim / Math.max(W, H));
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const v = avg > 128? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);
    const finalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(finalData.data, finalData.width, finalData.height, { inversionAttempts: 'attemptBoth' });
    if (!code) continue;
    const loc = code.location;
    const corners = [loc.topLeftCorner, loc.topRightCorner, loc.bottomLeftCorner, loc.bottomRightCorner];
    const minX = Math.min(...corners.map(c => c.x)), maxX = Math.max(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y)), maxY = Math.max(...corners.map(c => c.y));
    let x = minX, y = minY, size = (maxX - minX + (maxY - minY)) / 2;
    let modules: number | null = null;
    const version = (code as any).version;
    if (version) { modules = 17 + 4 * version; const tl = loc.topLeftFinderPattern, tr = loc.topRightFinderPattern, bl = loc.bottomLeftFinderPattern; const m = (dist(tl, tr) + dist(tl, bl)) / 2 / (modules - 7); x = tl.x - 3.5 * m; y = tl.y - 3.5 * m; size = modules * m; }
    x /= scale; y /= scale; size /= scale;
    return { area: { x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)), size: Math.round(size) }, modules };
  }
  return null;
}

function luminance(r: number, g: number, b: number) { const f = (v: number) => { const s = v / 255; return s <= 0.03928? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export function sampleColors(img: HTMLImageElement, area: QrArea) {
  const BLACK = { fg: '#000000', bg: '#ffffff' }; const W = img.naturalWidth, H = img.naturalHeight;
  const margin = Math.max(4, Math.round(area.size * 0.12)); const sx = Math.max(0, area.x - margin), sy = Math.max(0, area.y - margin);
  const ex = Math.min(W, area.x + area.size + margin), ey = Math.min(H, area.y + area.size + margin); const sw = ex - sx, sh = ey - sy;
  if (sw < 4 || sh < 4) return BLACK; const k = Math.min(1, 240 / Math.max(sw, sh)); const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return BLACK;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch); const d = ctx.getImageData(0, 0, cw, ch).data;
  const ix0 = (area.x - sx) * k, iy0 = (area.y - sy) * k, ix1 = ix0 + area.size * k, iy1 = iy0 + area.size * k;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>(); const darks: { l: number; r: number; g: number; b: number }[] = [];
  for (let y = 0; y < ch; y++) { for (let x = 0; x < cw; x++) { const i = (y * cw + x) * 4; const r = d[i], g = d[i + 1], b = d[i + 2]; const inside = x >= ix0 && x < ix1 && y >= iy0 && y < iy1; if (inside) { darks.push({ l: luminance(r, g, b), r, g, b }); continue; } const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; buckets.set(key, e); } }
  let best = null as any; buckets.forEach(e => { if (!best || e.n > best.n) best = e; }); if (!best ||!darks.length) return BLACK;
  const bgRGB = [best.r / best.n, best.g / best.n, best.b / best.n]; darks.sort((a, b) => a.l - b.l); const take = darks.slice(0, Math.max(1, Math.floor(darks.length * 0.15)));
  const fgRGB = [take.reduce((s, p) => s + p.r, 0) / take.length, take.reduce((s, p) => s + p.g, 0) / take.length, take.reduce((s, p) => s + p.b, 0) / take.length];
  const lb = luminance(bgRGB[0], bgRGB[1], bgRGB[2]), lf = luminance(fgRGB[0], fgRGB[1], fgRGB[2]); if (lb <= lf || (lb + 0.05) / (lf + 0.05) < 4) return BLACK;
  return { fg: hex(fgRGB[0], fgRGB[1], fgRGB[2]), bg: hex(bgRGB[0], bgRGB[1], bgRGB[2]) };
}

const LOGO_SVG: Record<Exclude<LogoStyle, 'none'>, string> = {
  google: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".5" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="#fff" stroke-width="3"/><circle cx="24" cy="24" r="6.5" fill="none" stroke="#fff" stroke-width="3"/></svg>`,
  whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="#25D366"/><path fill="#fff" d="M12 20c0 5 4 9 9 9c1.5 0 3-.4 4.2-1.1l3 1-1-3c.8-1.2 1.3-2.7 1.3-4.2c0-5-4-9-9-9s-9 4-9 9z"/></svg>`,
};
export const LOGO_SVG_PREVIEW = LOGO_SVG;
const logoCache = new Map<string, HTMLImageElement>();
async function logoImage(style: Exclude<LogoStyle, 'none'>) { const hit = logoCache.get(style); if (hit) return hit; const img = await loadSvgImage(LOGO_SVG[style]); logoCache.set(style, img); return img; }
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { const rr = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath(); }
export interface RenderOptions { area: QrArea; modules: number | null; fg: string; bg: string; style: LogoStyle; url: string; scale?: number; opaque?: boolean; }
export async function renderPlaque(canvas: HTMLCanvasElement, img: HTMLImageElement, o: RenderOptions) {
  const scale = o.scale?? 1; const W = Math.max(1, Math.round(img.naturalWidth * scale)), H = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas');
  if (o.opaque) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); } ctx.drawImage(img, 0, 0, W, H);
  const x = Math.round(o.area.x * scale), y = Math.round(o.area.y * scale), side = Math.max(8, Math.round(o.area.size * scale));
  const oldModule = o.modules? side / o.modules : side * 0.03; const pad = Math.round(oldModule * 0.75);
  ctx.fillStyle = o.bg; ctx.fillRect(x - pad, y - pad, side + pad * 2, side + pad * 2);
  const level = o.style === 'none'? 'M' : 'H'; const qr = await loadSvgImage(qrSvgMarkup(o.url, side, { fg: o.fg, bg: o.bg, level }));
  ctx.imageSmoothingEnabled = false; ctx.drawImage(qr, x, y, side, side); ctx.imageSmoothingEnabled = true;
  if (o.style!== 'none') { const logo = await logoImage(o.style); const L = Math.round(side * 0.2), plate = Math.round(L * 1.24), cx = x + side / 2, cy = y + side / 2; ctx.fillStyle = o.bg; roundedRectPath(ctx, cx - plate / 2, cy - plate / 2, plate, plate, plate * 0.22); ctx.fill(); ctx.drawImage(logo, cx - L / 2, cy - L / 2, L, L); }
}
export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number) { return new Promise<Blob>((resolve, reject) => { canvas.toBlob(b => b? resolve(b) : reject(new Error('Falha')), type, quality); }); }
