/** Escritores mínimos (sem dependências) de ZIP (sem compressão) e PDF com imagens JPEG. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export interface ZipEntry { name: string; blob: Blob }

/** ZIP "store" (PNG/JPEG já são comprimidos). Os blobs não são duplicados em memória. */
export async function buildZip(entries: ZipEntry[], onProgress?: (done: number) => void): Promise<Blob> {
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (let i = 0; i < entries.length; i++) {
    const { name, blob } = entries[i];
    const nameBytes = enc.encode(name);
    const crc = crc32(new Uint8Array(await blob.arrayBuffer()));

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, blob.size, true);
    lh.setUint32(22, blob.size, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    parts.push(lh.buffer, nameBytes, blob);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, blob.size, true);
    ch.setUint32(24, blob.size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint32(42, offset, true);
    const rec = new Uint8Array(46 + nameBytes.length);
    rec.set(new Uint8Array(ch.buffer), 0);
    rec.set(nameBytes, 46);
    central.push(rec);

    offset += 30 + nameBytes.length + blob.size;
    onProgress?.(i + 1);
  }

  const cdSize = central.reduce((s, r) => s + r.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  parts.push(...central, end.buffer);
  return new Blob(parts, { type: 'application/zip' });
}

export interface PdfPage { jpeg: Blob; widthPx: number; heightPx: number }

/**
 * PDF com uma página por plaquinha. A página tem o tamanho físico da arte (px / dpi * 72 pt),
 * com o JPEG embutido sem reamostragem — pronto para a gráfica.
 */
export async function buildPdf(pages: PdfPage[], dpi: number): Promise<Blob> {
  const parts: BlobPart[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (p: BlobPart, len: number) => { parts.push(p); pos += len; };
  const str = (s: string) => { const b = enc.encode(s); push(b, b.length); };
  const objStart = (id: number) => { offsets[id] = pos; str(`${id} 0 obj\n`); };

  str('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]), 6);

  const kids = pages.map((_, k) => `${3 + k * 3} 0 R`).join(' ');
  objStart(1); str('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objStart(2); str(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  for (let k = 0; k < pages.length; k++) {
    const pg = pages[k];
    const pageId = 3 + k * 3, contentId = pageId + 1, imageId = pageId + 2;
    const w = +(pg.widthPx / dpi * 72).toFixed(3);
    const h = +(pg.heightPx / dpi * 72).toFixed(3);

    objStart(pageId);
    str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);

    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    objStart(contentId);
    str(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    objStart(imageId);
    str(`<< /Type /XObject /Subtype /Image /Width ${pg.widthPx} /Height ${pg.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.size} >>\nstream\n`);
    push(pg.jpeg, pg.jpeg.size);
    str('\nendstream\nendobj\n');
  }

  const total = 3 + pages.length * 3;
  const xrefPos = pos;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  str(xref);
  return new Blob(parts, { type: 'application/pdf' });
}
