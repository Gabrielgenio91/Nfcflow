import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';

export type QrLevel = 'L' | 'M' | 'Q' | 'H';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/**
 * Gera o SVG (vetorial) de um QR Code usando a biblioteca já instalada (qrcode.react).
 * `size` é o lado em pixels: o SVG já sai no tamanho final, então não há reamostragem borrada.
 */
export function qrSvgMarkup(value: string, size: number, opts: { fg: string; bg: string; level: QrLevel }): string {
  if (typeof document === 'undefined') throw new Error('qrSvgMarkup só roda no navegador');
  if (!host || !root) {
    host = document.createElement('div');
    root = createRoot(host);
  }
  flushSync(() => {
    root!.render(
      createElement(QRCodeSVG, { value, size, level: opts.level, marginSize: 0, fgColor: opts.fg, bgColor: opts.bg })
    );
  });
  const svg = host.querySelector('svg');
  if (!svg) throw new Error('Falha ao gerar o QR Code');
  return new XMLSerializer().serializeToString(svg);
}

export function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar o SVG'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
