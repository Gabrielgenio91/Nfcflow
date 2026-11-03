'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, ScanSearch, Sparkles, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Plus, Minus, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { assertImageSize, canvasToBlob, detectQrArea, LOGO_SVG_PREVIEW, loadImageFile, renderPlaque, sampleColors, type LogoStyle, type QrArea } from '@/lib/plaque-art';
import { buildPdf, buildZip, type PdfPage, type ZipEntry } from '@/lib/pdf-zip';
import { cn } from '@/lib/utils';
import { useStoreSettings, invalidateStoreSettings } from '@/hooks/use-store-settings';

const ENV_APP_URL = (process.env.NEXT_PUBLIC_QR_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
const BASE_RE = /^https?:\/\/[^\s/]+$/i;
const MAX_FILE_MB = 60;
const MAX_QTY = 200;
const STYLES: { key: LogoStyle; label: string; hint: string }[] = [
  { key: 'none', label: 'Sem logo', hint: 'QR limpo' },
  { key: 'google', label: 'Google', hint: 'G colorido' },
  { key: 'instagram', label: 'Instagram', hint: 'Logo no centro' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'Logo no centro' },
];

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function pctStr(v: number, total: number) {
  return String((v / total) * 100) + '%';
}
interface Product { id: string; name: string }
interface Template { id: string; name: string; x_ratio: number; y_ratio: number; size_ratio: number; style: LogoStyle }

const STEP = 'h-11 w-11 flex-shrink-0';
function Stepper({ label, value, onChange, onMinus, onPlus, minus, plus }: { label: string; value: number; onChange: (v: string) => void; onMinus: () => void; onPlus: () => void; minus: React.ReactNode; plus: React.ReactNode }) {
  return (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="icon" className={STEP} onClick={onMinus} aria-label={`${label} -`}>{minus}</Button>
      <Input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 min-w-0 flex-1 text-center" />
      <Button type="button" variant="outline" size="icon" className={STEP} onClick={onPlus} aria-label={`${label} +`}>{plus}</Button>
    </div>
  </div>
  );
}

export default function GeneratePlaquesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [dpi, setDpi] = useState('300');
  const [style, setStyle] = useState<LogoStyle>('none');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<boolean | null>(null);
  const [area, setArea] = useState<QrArea | null>(null);
  const [modules, setModules] = useState<number | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [batchBase, setBatchBase] = useState('');
  const [batchProduct, setBatchProduct] = useState('');
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<null | 'zip' | 'pdf' | string>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const settings = useStoreSettings();
  const [baseInput, setBaseInput] = useState<string | null>(null);
  const [savingBase, setSavingBase] = useState(false);
  const [localBase, setLocalBase] = useState('');
  useEffect(() => {
    if (typeof window!== 'undefined') setLocalBase(localStorage.getItem('nfcflow_qr_base_url') || '');
  }, []);
  const baseShown = baseInput ?? (settings.qrBaseUrl || localBase || ENV_APP_URL);
  const rawBase = baseShown.trim().replace(/\/+$/, '');
  const APP_URL = BASE_RE.test(rawBase)? rawBase : '';
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const previewRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);
  const work = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    supabase.from('products').select('id, name').eq('status', 'ATIVO').order('name').then(({ data }) => setProducts((data as Product[]) || []));
  }, [supabase]);
  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('plaque_templates').select('id, name, x_ratio, y_ratio, size_ratio, style').order('created_at', { ascending: false });
    setTemplates(((data as Template[]) || []).map((t) => ({ ...t, x_ratio: Number(t.x_ratio), y_ratio: Number(t.y_ratio), size_ratio: Number(t.size_ratio) })));
  }, [supabase]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);

  const runDetection = useCallback(async (image: HTMLImageElement) => {
    setDetecting(true);
    try {
      const found = await detectQrArea(image);
      if (found) {
        setArea(found.area);
        setModules(found.modules);
        setDetected(true);
        toast.success('QR detectado perfeito!');
      } else {
        const side = Math.round(Math.min(image.naturalWidth, image.naturalHeight) * 0.32);
        setArea({ x: Math.round((image.naturalWidth - side) / 2), y: Math.round((image.naturalHeight - side) / 2), size: side });
        setModules(null);
        setDetected(false);
      }
    } finally { setDetecting(false); }
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error('Use PNG, JPG ou WebP.'); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`Maior que ${MAX_FILE_MB} MB.`); return; }
    try {
      const { img: image, url } = await loadImageFile(file);
      assertImageSize(image);
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setImg(image);
      setImgUrl(url);
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setTokens([]);
      setDetected(null);
      await runDetection(image);
    } catch (e) {
      toast.error(e instanceof Error? e.message : 'Erro ao abrir');
    }
  };

  useEffect(() => {
    if (!img ||!area ||!previewRef.current) return;
    const seq = ++renderSeq.current;
    const t = setTimeout(async () => {
      try {
        const colors = sampleColors(img, area);
        const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
        const off = document.createElement('canvas');
        await renderPlaque(off, img, { area, modules,...colors, style, scale, url: `${APP_URL || 'https://seudominio.com'}/q/EXEMPLO1` });
        if (seq!== renderSeq.current ||!previewRef.current) return;
        const target = previewRef.current;
        target.width = off.width;
        target.height = off.height;
        target.getContext('2d')?.drawImage(off, 0, 0);
      } catch (e) { console.error(e); }
    }, 120);
    return () => clearTimeout(t);
  }, [img, area, modules, style, APP_URL]);

  const drag = useRef<null | { mode: 'move' | 'resize'; sx: number; sy: number; start: QrArea }>(null);
  const onPointerDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!area) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: area };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d ||!img ||!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const k = img.naturalWidth / rect.width;
    const dx = (e.clientX - d.sx) * k, dy = (e.clientY - d.sy) * k;
    if (d.mode === 'move') {
      setArea({...d.start, x: Math.round(Math.max(0, Math.min(d.start.x + dx, img.naturalWidth - d.start.size))), y: Math.round(Math.max(0, Math.min(d.start.y + dy, img.naturalHeight - d.start.size))) });
    } else {
      const size = Math.round(Math.max(40, Math.min(d.start.size + (dx + dy) / 2, img.naturalWidth - d.start.x, img.naturalHeight - d.start.y)));
      setArea({...d.start, size });
    }
    setModules(null);
  };
  const endDrag = () => { drag.current = null; };
  const nudge = (dx: number, dy: number) => {
    if (!img ||!area) return;
    setArea({...area, x: Math.max(0, Math.min(area.x + dx, img.naturalWidth - area.size)), y: Math.max(0, Math.min(area.y + dy, img.naturalHeight - area.size)) });
    setModules(null);
  };
  const changeSize = (delta: number) => {
    if (!img ||!area) return;
    const size = Math.max(40, Math.min(area.size + delta, img.naturalWidth - area.x, img.naturalHeight - area.y));
    setArea({...area, size });
    setModules(null);
  };
  const setField = (k: keyof QrArea, v: string) => {
    if (!img ||!area) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return;
    const next = {...area, [k]: n } as QrArea;
    next.size = Math.max(40, Math.min(next.size, img.naturalWidth, img.naturalHeight));
    next.x = Math.max(0, Math.min(next.x, img.naturalWidth - next.size));
    next.y = Math.max(0, Math.min(next.y, img.naturalHeight - next.size));
    setArea(next);
    setModules(null);
  };

  const saveTemplate = async () => {
    if (!img || !area) return;
    const name = templateName.trim();
    if (!name) { toast.error('Dê um nome ao modelo'); return; }
    const { error } = await supabase.from('plaque_templates').insert({
      name, x_ratio: +(area.x / img.naturalWidth).toFixed(8), y_ratio: +(area.y / img.naturalHeight).toFixed(8),
      size_ratio: +(area.size / img.naturalWidth).toFixed(8), img_width: img.naturalWidth, img_height: img.naturalHeight, style,
    });
    if (error) { toast.error('Erro ao salvar o modelo'); return; }
    toast.success('Modelo salvo');
    setTemplateName('');
    loadTemplates();
  };
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t || !img) return;
    const size = Math.round(Math.min(t.size_ratio * img.naturalWidth, img.naturalWidth, img.naturalHeight));
    setArea({
      x: Math.round(Math.min(t.x_ratio * img.naturalWidth, img.naturalWidth - size)),
      y: Math.round(Math.min(t.y_ratio * img.naturalHeight, img.naturalHeight - size)),
      size,
    });
    setModules(null);
    setStyle(t.style);
    toast.success(`Modelo "${t.name}" aplicado`);
  };
  const deleteTemplate = async () => {
    if (!templateId || !confirm('Excluir este modelo?')) return;
    await supabase.from('plaque_templates').delete().eq('id', templateId);
    setTemplateId('');
    loadTemplates();
  };

  const saveBaseDefault = async () => {
    if (!rawBase ||!BASE_RE.test(rawBase)) { toast.error('URL inválida. Ex: https://seudominio.com'); return; }
    setSavingBase(true);
    try {
      if (typeof window!== 'undefined') { localStorage.setItem('nfcflow_qr_base_url', rawBase); setLocalBase(rawBase); }
      try {
        const { data, error } = await supabase.rpc('admin_set_qr_base_url', { p_url: rawBase });
        if (error) throw error;
        toast.success(data? `URL salva: ${data}` : 'URL salva!');
      } catch { toast.success(`URL salva local: ${rawBase}`); }
      invalidateStoreSettings();
      await settings.reload().catch(() => {});
      setBaseInput(null);
      setBatchBase(rawBase);
    } catch (e: any) { toast.error('Erro: ' + e.message); } finally { setSavingBase(false); }
  };

  const tokensCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ['token,url_qr,produto,arquivo'];
    tokens.forEach((t) => lines.push([t, `${batchBase || APP_URL}/q/${t}`, esc(batchProduct), `${fileName || 'plaquinha'}-${t}.png`].join(',')));
    return new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  };
  const qty = parseInt(quantity, 10);
  const dpiN = Math.max(72, Math.min(1200, parseInt(dpi, 10) || 300));
  const canGenerate =!!img &&!!area &&!!productId && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY &&!generating;

  const generate = async () => {
    if (!APP_URL) { toast.error('Informe a URL base do QR (ex.: https://seudominio.com)'); return; }
    if (!img || !area || !canGenerate) return;
    setGenerating(true);
    try {
      // os tokens SÓ são criados no banco (únicos e permanentes); sem banco, nada é gerado
      const res = await fetch('/api/admin/plaques/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: productId, quantity: qty }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      const list = (data.tokens as string[]) || [];
      if (list.length !== qty) throw new Error('O banco não confirmou todas as plaquinhas.');
      setTokens(list);
      setBatchBase(APP_URL);
      setBatchProduct(products.find((p) => p.id === productId)?.name || '');
      toast.success(`${list.length} plaquinha(s) criada(s) com token único e permanente.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar as plaquinhas. Nenhum QR foi gerado.');
    } finally { setGenerating(false); }
  };

  const renderOne = async (token: string, type: 'image/png' | 'image/jpeg', colors: { fg: string; bg: string }) => {
    if (!img ||!area) throw new Error('Sem arte');
    if (!work.current) work.current = document.createElement('canvas');
    await renderPlaque(work.current, img, { area, modules,...colors, style, scale: 1, opaque: type === 'image/jpeg', url: `${batchBase || APP_URL}/q/${token}` });
    const blob = await canvasToBlob(work.current, type, type === 'image/jpeg'? 0.95 : undefined);
    return { blob, w: work.current.width, h: work.current.height };
  };
  const exportZip = async () => {
    if (!img ||!area) return;
    setBusy('zip'); setProgress({ done: 0, total: tokens.length });
    try {
      const colors = sampleColors(img, area);
      const entries: ZipEntry[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const { blob } = await renderOne(tokens[i], 'image/png', colors);
        entries.push({ name: `${fileName || 'plaquinha'}-${tokens[i]}.png`, blob });
        setProgress({ done: i + 1, total: tokens.length });
      }
      entries.push({ name: `${fileName || 'plaquinhas'}-tokens.csv`, blob: tokensCsv() });
      download(await buildZip(entries), `${fileName || 'plaquinhas'}-NFCFLOW.zip`);
      toast.success('ZIP HD gerado!');
    } catch { toast.error('Erro ZIP'); } finally { setBusy(null); setProgress(null); }
  };
  const exportPdf = async () => {
    if (!img ||!area) return;
    setBusy('pdf'); setProgress({ done: 0, total: tokens.length });
    try {
      const colors = sampleColors(img, area);
      const pages: PdfPage[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const { blob, w, h } = await renderOne(tokens[i], 'image/jpeg', colors);
        pages.push({ jpeg: blob, widthPx: w, heightPx: h });
        setProgress({ done: i + 1, total: tokens.length });
      }
      download(await buildPdf(pages, dpiN), `${fileName || 'plaquinhas'}-grafica.pdf`);
      toast.success('PDF 300dpi gerado!');
    } catch { toast.error('Erro PDF'); } finally { setBusy(null); setProgress(null); }
  };
  const exportOne = async (token: string) => {
    if (!img ||!area) return;
    setBusy(token);
    try {
      const { blob } = await renderOne(token, 'image/png', sampleColors(img, area));
      download(blob, `${fileName || 'plaquinha'}-${token}.png`);
    } catch { toast.error('Erro'); } finally { setBusy(null); }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gerar Plaquinhas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Envie a arte, ajuste o QR e exporte em alta para a gráfica. Cada plaquinha recebe um QR dinâmico com token único e permanente.</p>
      </div>

      {!APP_URL && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>Informe a URL base do QR na etapa 3 (ex.: https://seudominio.com).</span>
        </div>
      )}

      {/* 1. ARTE */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ImagePlus className="h-4 w-4" />1. Arte</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-6 text-center text-sm transition-colors hover:border-primary/50">
            <ImagePlus className="h-8 w-8 text-muted-foreground" />
            <span>{img ? 'Trocar arte' : 'Toque para enviar PNG, JPG ou WebP'}</span>
            <span className="text-xs text-muted-foreground">Quanto maior a resolução, melhor a impressão.</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>

          {img && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-muted-foreground">{img.naturalWidth} × {img.naturalHeight}px</span>
                {detecting ? (
                  <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Procurando o QR…</span>
                ) : detected ? (
                  <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />QR detectado</span>
                ) : (
                  <span className="flex items-center gap-1 text-warning"><AlertTriangle className="h-3.5 w-3.5" />Ajuste a área manualmente</span>
                )}
                <Button type="button" variant="ghost" size="sm" className="ml-auto h-10" disabled={detecting} onClick={() => img && runDetection(img)}>
                  <ScanSearch className="mr-1.5 h-4 w-4" />Detectar de novo
                </Button>
              </div>

              <div ref={boxRef} className="relative mx-auto w-full select-none overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                style={{ aspectRatio: `${img.naturalWidth} / ${img.naturalHeight}` }}>
                <canvas ref={previewRef} className="absolute inset-0 h-full w-full" />
                {area && (
                  <div
                    onPointerDown={onPointerDown('move')} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
                    className="absolute cursor-move border-2 border-dashed border-primary"
                    style={{ left: pctStr(area.x, img.naturalWidth), top: pctStr(area.y, img.naturalHeight), width: pctStr(area.size, img.naturalWidth), height: pctStr(area.size, img.naturalHeight), touchAction: 'none' }}
                  >
                    <div
                      onPointerDown={onPointerDown('resize')} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
                      className="absolute -bottom-3 -right-3 h-7 w-7 cursor-nwse-resize rounded-full border-2 border-white bg-primary"
                      style={{ touchAction: 'none' }} aria-label="Redimensionar"
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">A prévia usa um token de exemplo. Arraste a caixa para mover e o ponto roxo para redimensionar.</p>

              {area && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stepper label="X (px)" value={area.x} onChange={(v) => setField('x', v)} onMinus={() => nudge(-1, 0)} onPlus={() => nudge(1, 0)} minus={<ArrowLeft className="h-4 w-4" />} plus={<ArrowRight className="h-4 w-4" />} />
                    <Stepper label="Y (px)" value={area.y} onChange={(v) => setField('y', v)} onMinus={() => nudge(0, -1)} onPlus={() => nudge(0, 1)} minus={<ArrowUp className="h-4 w-4" />} plus={<ArrowDown className="h-4 w-4" />} />
                    <Stepper label="Tamanho (px)" value={area.size} onChange={(v) => setField('size', v)} onMinus={() => changeSize(-2)} onPlus={() => changeSize(2)} minus={<Minus className="h-4 w-4" />} plus={<Plus className="h-4 w-4" />} />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-white/[0.04] p-3">
                    <span className="w-full text-center text-xs text-muted-foreground sm:w-auto">Ajuste de 5 px:</span>
                    <Button type="button" variant="outline" size="icon" className={STEP} onClick={() => nudge(-5, 0)} aria-label="Esquerda 5px"><ArrowLeft className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="icon" className={STEP} onClick={() => nudge(0, -5)} aria-label="Cima 5px"><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="icon" className={STEP} onClick={() => nudge(0, 5)} aria-label="Baixo 5px"><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="icon" className={STEP} onClick={() => nudge(5, 0)} aria-label="Direita 5px"><ArrowRight className="h-4 w-4" /></Button>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-white/[0.08] p-3">
                    <p className="text-sm font-medium">Modelos de posicionamento</p>
                    {templates.length > 0 && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}
                          className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-white/[0.03] px-3 text-sm">
                          <option value="">Aplicar um modelo salvo…</option>
                          {templates.map((t) => <option key={t.id} value={t.id} className="bg-card">{t.name}</option>)}
                        </select>
                        <Button type="button" variant="outline" className="h-11" disabled={!templateId} onClick={deleteTemplate}>Excluir</Button>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Nome do modelo (ex.: Placa 15x20)" maxLength={80} className="h-11 min-w-0 flex-1" />
                      <Button type="button" className="h-11" onClick={saveTemplate}>Salvar modelo</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Guarda posição, tamanho (em proporção da arte) e estilo — vale para outras artes do mesmo formato, em qualquer resolução.</p>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. ESTILO */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />2. Estilo do QR</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STYLES.map((st) => (
              <button key={st.key} type="button" onClick={() => setStyle(st.key)}
                className={cn('flex flex-col items-center gap-2 rounded-2xl border p-3 text-sm transition-colors',
                  style === st.key ? 'border-primary/60 bg-primary/10' : 'border-white/[0.08] hover:border-white/20')}>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
                  {st.key === 'none' ? (
                    <span className="h-6 w-6 rounded-sm border-2 border-dashed border-gray-400" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="h-7 w-7" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG_PREVIEW[st.key as Exclude<LogoStyle, 'none'>])}`} />
                  )}
                </span>
                <span className="font-medium">{st.label}</span>
                <span className="text-xs text-muted-foreground">{st.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">O QR sempre aponta para {APP_URL || 'URL-base'}/q/[token]. A logo é só visual, pequena e centralizada; o QR continua escaneável.</p>
        </CardContent>
      </Card>

      {/* 3. URL, PRODUTO E QUANTIDADE */}
      <Card>
        <CardHeader><CardTitle className="text-base">3. URL base, produto e quantidade</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="base">URL base do QR (novos lotes)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="base" type="url" inputMode="url" value={baseShown} onChange={(e) => setBaseInput(e.target.value)} placeholder="https://seu-dominio.com" className="h-12 min-w-0 flex-1" />
              <Button type="button" variant="outline" onClick={saveBaseDefault} disabled={savingBase} className="h-12 sm:w-36">
                {savingBase ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar padrão'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Cada QR vira {APP_URL || 'URL-base'}/q/TOKEN. QRs antigos continuam funcionando enquanto o domínio antigo apontar para este sistema.</p>
            {rawBase && !APP_URL && <p className="text-xs text-destructive">URL inválida. Use https://dominio.com (sem caminho).</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod">Produto</Label>
            <select id="prod" value={productId} onChange={(e) => setProductId(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-white/[0.03] px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Selecione…</option>
              {products.map((p) => <option key={p.id} value={p.id} className="bg-card">{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantidade (máx. {MAX_QTY})</Label>
              <Input id="qty" type="number" inputMode="numeric" min={1} max={MAX_QTY} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dpi">DPI (PDF gráfica)</Label>
              <Input id="dpi" type="number" inputMode="numeric" value={dpi} onChange={(e) => setDpi(e.target.value)} className="h-12" />
            </div>
          </div>

          <Button type="button" disabled={!canGenerate || !APP_URL} onClick={generate} className="h-12 w-full text-base">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : `Gerar ${Number.isInteger(qty) && qty > 0 ? qty : ''} plaquinha(s)`}
          </Button>
          <p className="text-xs text-muted-foreground">Os tokens são criados no banco: únicos, permanentes e impossíveis de duplicar. As plaquinhas entram como DISPONÍVEIS.</p>
        </CardContent>
      </Card>

      {/* 4. EXPORTAÇÃO */}
      {tokens.length > 0 && (
        <Card className="border-success/30">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-success" />{tokens.length} plaquinha(s) gerada(s) — exportar</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" onClick={exportZip} disabled={busy !== null} className="h-14">
                {busy === 'zip' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="mr-2 h-4 w-4" />Imagens PNG (ZIP + tokens)</>}
              </Button>
              <Button type="button" variant="outline" onClick={exportPdf} disabled={busy !== null} className="h-14">
                {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="mr-2 h-4 w-4" />PDF para gráfica ({dpiN} dpi)</>}
              </Button>
            </div>
            <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => download(tokensCsv(), `${fileName || 'plaquinhas'}-tokens.csv`)}>
              <FileText className="mr-2 h-4 w-4" />Baixar só a lista de tokens (CSV)
            </Button>
            {progress && (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full gradient-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                <p className="text-xs text-muted-foreground">Renderizando {progress.done}/{progress.total} na resolução original da arte…</p>
              </div>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/[0.08] p-2">
              {tokens.map((t) => (
                <div key={t} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]">
                  <span className="truncate font-mono">{t}</span>
                  <Button type="button" size="sm" variant="ghost" className="h-10 flex-shrink-0" disabled={busy !== null} onClick={() => exportOne(t)}>
                    {busy === t ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="mr-1.5 h-3.5 w-3.5" />PNG</>}
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">O PDF tem uma página por plaquinha, no tamanho físico da arte, com a imagem embutida sem reamostragem. Se a arte for muito grande, baixe em lotes menores.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
