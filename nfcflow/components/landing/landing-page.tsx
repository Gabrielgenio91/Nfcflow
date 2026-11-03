'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { whatsappUrl } from '@/components/shared/whatsapp';

import { NfcBrand } from './landing-logo';
import {
  GoogleG,
  IcArrowRight,
  IcArrowUp,
  IcBars,
  IcBrowser,
  IcCart,
  IcCartCheck,
  IcChartLine,
  IcChevronDown,
  IcChip,
  IcClose,
  IcEdit,
  IcHeadset,
  IcMenu,
  IcQr,
  IcRefresh,
  IcScan,
  IcShieldQr,
  IcTouch,
  IcUserSquare,
  IcUsers,
  IcWaves,
} from './icons';
import './landing.css';

/* ------------------------------------------------------------------ */
/* Dados DEMONSTRATIVOS — não representam faturamento real de ninguém. */
/* ------------------------------------------------------------------ */
const DEMO_POINTS_K = [1.5, 2.6, 3.5, 3.9, 5.5, 5.4, 6.2, 7.0, 7.8, 8.5, 10.0, 10.1, 12.0, 12.48];
const CHART_W = 520;
const CHART_H = 118; // 0 → 15k
const Y_MAX_K = 15;

function buildCurve() {
  const pts = DEMO_POINTS_K.map((v, i) => ({
    x: (i / (DEMO_POINTS_K.length - 1)) * CHART_W,
    y: CHART_H - (v / Y_MAX_K) * CHART_H,
  }));
  // curva suave (Catmull-Rom → Bézier)
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return { line: d, area: `${d} L${CHART_W},${CHART_H} L0,${CHART_H} Z`, last: pts[pts.length - 1], pts };
}

const NAV = [
  { href: '#inicio', label: 'Início' },
  { href: '#produto', label: 'Produto' },
  { href: '#beneficios', label: 'Benefícios' },
  { href: '#como-funciona', label: 'Como Funciona' },
  { href: '#comecar', label: 'Depoimentos' },
];

const HERO_PERKS = [
  { icon: <GoogleG />, label: ['Mais avaliações', 'no Google'], g: true },
  { icon: <IcBrowser />, label: ['Aumente sua', 'presença online'] },
  { icon: <IcTouch />, label: ['Fácil de usar', 'e configurar'] },
];

const METRICS = [
  { tone: 'green', icon: <IcShieldQr />, title: 'Ativas', value: '48', text: 'plaquinhas em uso' },
  { tone: 'purple', icon: <IcUserSquare />, title: 'Clientes', value: '32', text: 'clientes ativos' },
  { tone: 'blue', icon: <IcScan />, title: 'Scans', value: '1.248', text: 'total de escaneamentos' },
];

const PRODUCT_FEATURES = [
  { icon: <IcWaves />, title: 'Aproximou. Abriu.', text: 'O cliente aproxima o celular e acessa o destino.' },
  { icon: <IcQr />, title: 'Escaneou. Abriu.', text: 'O QR Code oferece uma segunda forma de acesso.' },
  { icon: <IcRefresh />, title: 'Mudou. Atualizou.', text: 'O destino pode ser alterado sem trocar a plaquinha.' },
];

const BENEFITS = [
  { icon: <IcCart />, title: 'Ativação rápida e simples', text: 'Em poucos cliques.' },
  { icon: <IcChartLine />, title: 'Acompanhe seu faturamento', text: 'Em tempo real.' },
  { icon: <IcUsers />, title: 'Gerencie seus clientes', text: 'Tudo em um só lugar.' },
  { icon: <IcHeadset />, title: 'Suporte especializado', text: 'Sempre que precisar.' },
  { icon: <GoogleG />, title: 'Mais avaliações no Google', text: 'Aumente sua reputação.', g: true },
  { icon: <IcEdit />, title: 'Treinamento e cursos', text: 'Aprenda e cresça.' },
];

const STEPS = [
  { icon: <IcCart />, title: 'Compre', text: 'suas plaquinhas' },
  { icon: <IcTouch />, title: 'Ative', text: 'e personalize' },
  { icon: <IcBars />, title: 'Acompanhe', text: 'seus resultados' },
];

const Y_LABELS = ['R$ 15.000', 'R$ 10.000', 'R$ 5.000', 'R$ 0'];
const X_LABELS = ['01 Abr', '05 Abr', '10 Abr', '15 Abr', '20 Abr', '25 Abr', '30 Abr'];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const curve = useMemo(buildCurve, []);
  const settings = useStoreSettings();

  // mesmo critério do botão flutuante global (número do ADMIN → Suporte, ou link do .env)
  const waPhone = settings.supportWhatsapp || (process.env.NEXT_PUBLIC_WHATSAPP_LINK || '').trim();
  const waUrl = useMemo(
    () => whatsappUrl(waPhone, 'Olá! Vim pelo site NFCFLOW.'),
    [waPhone]
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="nf-landing">
      {/* ============ CABEÇALHO ============ */}
      <header className="nf-header">
        <div className="nf-wrap nf-header__row">
          <Link href="/" className="nf-header__logo" aria-label="NFCFLOW — início">
            <NfcBrand />
          </Link>

          <nav className="nf-nav" aria-label="Principal">
            {NAV.map((n, i) => (
              <a key={n.href + n.label} href={n.href} className={i === 0 ? 'is-active' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>

          <div className="nf-header__actions">
            <Link href="/login" className="nf-btn nf-btn--sm">
              Entrar
            </Link>
            <button
              type="button"
              className="nf-menu-btn"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="nf-mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <IcClose /> : <IcMenu />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="nf-mobile-nav" className="nf-mobile-nav" aria-label="Menu">
            {NAV.map((n) => (
              <a key={n.href + n.label} href={n.href} onClick={closeMenu}>
                {n.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main>
        {/* ============ HERO ============ */}
        <section id="inicio" className="nf-hero">
          <div className="nf-hero__glow" aria-hidden="true" />
          <div className="nf-hero__photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/hero-nfc.jpg"
              alt="Plaquinha NFCFLOW ao lado de um celular mostrando a página do Google com avaliações"
              width={1600}
              height={1205}
            />
          </div>

          <div className="nf-wrap nf-hero__inner">
            <div className="nf-hero__copy">
              <span className="nf-pill">
                <IcChip /> Tecnologia que conecta
              </span>

              <h1 className="nf-hero__title">
                <span>Transforme</span>
                <span>visitas em clientes</span>
                <span>
                  com apenas <em>um toque.</em>
                </span>
              </h1>

              <p className="nf-hero__lead">
                Plaquinhas NFC e QR Code que levam seus clientes direto para o seu Google, redes
                sociais e muito mais.
              </p>

              <div className="nf-hero__cta">
                <Link href="/login" className="nf-btn nf-btn--lg">
                  Começar agora <IcArrowRight />
                </Link>
                <a href="#produto" className="nf-btn nf-btn--lg nf-btn--ghost">
                  Saiba mais
                </a>
              </div>

              <ul className="nf-perks">
                {HERO_PERKS.map((p) => (
                  <li key={p.label[0]}>
                    <span className={`nf-perks__ico ${p.g ? 'is-g' : ''}`}>{p.icon}</span>
                    <span>
                      {p.label[0]}
                      <br />
                      {p.label[1]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ============ FATURAMENTO (DEMONSTRATIVO) ============ */}
        <section className="nf-wrap nf-block" aria-label="Exemplo do painel">
          <div className="nf-panel">
            <div className="nf-panel__left">
              <div className="nf-panel__head">
                <span className="nf-ico-box nf-ico-box--purple">
                  <IcCartCheck />
                </span>
                <div>
                  <h2 className="nf-panel__title">Faturamento</h2>
                  <p className="nf-panel__sub">Total em vendas das suas plaquinhas ativas</p>
                </div>
              </div>

              <p className="nf-panel__value">R$ 12.480,00</p>
              <p className="nf-panel__delta">
                <IcArrowUp /> <b>42%</b> <span>vs. período anterior</span>
              </p>

              <div className="nf-panel__foot">
                <span className="nf-select">
                  Últimos 30 dias <IcChevronDown />
                </span>
                <span className="nf-demo-tag">Exemplo ilustrativo</span>
              </div>
            </div>

            <div className="nf-chart" role="img" aria-label="Gráfico demonstrativo de crescimento de faturamento ao longo de 30 dias">
              <div className="nf-chart__y" aria-hidden="true">
                {Y_LABELS.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>

              <div className="nf-chart__plot">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="nf-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#8B5CF6" stopOpacity=".5" />
                      <stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map((i) => (
                    <line
                      key={i}
                      x1="0"
                      x2={CHART_W}
                      y1={(i * CHART_H) / 3}
                      y2={(i * CHART_H) / 3}
                      className="nf-chart__grid"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <path d={curve.area} fill="url(#nf-area)" />
                  <path d={curve.line} className="nf-chart__glow" vectorEffect="non-scaling-stroke" />
                  <path d={curve.line} className="nf-chart__line" vectorEffect="non-scaling-stroke" />
                </svg>
 {curve.pts.slice(0, -1).map((p, i) => (
                  <span
                    key={i}
                    className="nf-chart__pt"
                    style={{ left: `${(p.x / CHART_W) * 100}%`, top: `${(p.y / CHART_H) * 100}%` }}
                  />
                ))}
                <span className="nf-chart__dot" style={{ top: `${(curve.last.y / CHART_H) * 100}%` }} />
                <span className="nf-chart__tip" style={{ top: `calc(${(curve.last.y / CHART_H) * 100}% - 46px)` }}>
                  <b>R$ 12.480</b>
                  <small>30 Abr</small>
                </span>
              </div>

              <div className="nf-chart__x" aria-hidden="true">
                {X_LABELS.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ MÉTRICAS (DEMONSTRATIVAS) ============ */}
        <section className="nf-wrap nf-block nf-block--tight" aria-label="Exemplo de métricas do painel">
          <div className="nf-metrics">
            {METRICS.map((m) => (
              <div key={m.title} className="nf-metric">
                <span className={`nf-ico-box nf-ico-box--${m.tone}`}>{m.icon}</span>
                <div className="nf-metric__body">
                  <p className={`nf-metric__title nf-metric__title--${m.tone}`}>{m.title}</p>
                  <p className="nf-metric__value">{m.value}</p>
                  <p className="nf-metric__text">{m.text}</p>
                </div>
                <IcArrowRight className="nf-metric__arrow" />
              </div>
            ))}
          </div>
          <p className="nf-footnote">Valores ilustrativos, apenas para demonstrar o painel.</p>
        </section>

        {/* ============ PRODUTO ============ */}
        <section id="produto" className="nf-product">
          <div className="nf-product__glow" aria-hidden="true" />
          <div className="nf-product__photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/produto-nfc.jpg"
              alt="Plaquinha NFC e celular com a página de avaliações do Google"
              width={1500}
              height={789}
              loading="lazy"
            />
          </div>

          <div className="nf-wrap nf-product__inner">
            <div className="nf-product__copy">
              <p className="nf-eyebrow">
                <IcChip /> O produto
              </p>
              <h2 className="nf-h2">
                Pequena no tamanho. <em>Gigante na experiência.</em>
              </h2>
              <p className="nf-lead">
                Uma plaquinha física que conecta o mundo real ao digital através de NFC e QR Code.
              </p>

              <ul className="nf-features">
                {PRODUCT_FEATURES.map((f) => (
                  <li key={f.title}>
                    <span className="nf-feature__ico">{f.icon}</span>
                    <b>{f.title}</b>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ============ REVENDEDOR ============ */}
        <section id="beneficios" className="nf-reseller">
          <div className="nf-wrap nf-reseller__inner">
            <div className="nf-reseller__copy">
              <p className="nf-eyebrow nf-eyebrow--plain">Para o revendedor</p>
              <h2 className="nf-h2">
                <span>Seu negócio.</span>{' '}
                <span>
                  Seu painel. <em>Seu crescimento.</em>
                </span>
              </h2>
              <p className="nf-lead nf-lead--sm">
                Tudo pensado para você vender, ativar e acompanhar suas plaquinhas sem complicação.
              </p>
            </div>

            <ul className="nf-benefits">
              {BENEFITS.map((b) => (
                <li key={b.title} className="nf-benefit">
                  <span className={`nf-benefit__ico ${b.g ? 'is-g' : ''}`}>{b.icon}</span>
                  <span>
                    <b>{b.title}</b>
                    <small>{b.text}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ DO ESTOQUE AO FATURAMENTO ============ */}
        <section id="como-funciona" className="nf-steps">
          <div className="nf-steps__glow" aria-hidden="true" />
          <div className="nf-wrap">
            <p className="nf-steps__eyebrow">Simples assim</p>
            <h2 className="nf-steps__title">Do estoque ao faturamento.</h2>

            <ol className="nf-steps__row">
              {STEPS.map((s, i) => (
                <li key={s.title} className="nf-step">
                  <span className="nf-step__ico">{s.icon}</span>
                  <span className="nf-step__txt">
                    <b>{s.title}</b>
                    <small>{s.text}</small>
                  </span>
                  {i < STEPS.length - 1 && <IcArrowRight className="nf-step__arrow" />}
                </li>
              ))}
            </ol>

            <div id="comecar" className="nf-steps__cta">
              <Link href="/login" className="nf-btn nf-btn--lg">
                Começar agora <IcArrowRight />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ============ RODAPÉ ============ */}
      <footer className="nf-footer">
        <div className="nf-wrap nf-footer__row">
          <Link href="/" className="nf-footer__logo" aria-label="NFCFLOW — início">
            <NfcBrand className="nf-brand--sm" />
          </Link>
          <p className="nf-footer__copy">© {new Date().getFullYear()} NFCFLOW. Todos os direitos reservados.</p>
          <div className="nf-footer__links">
            <span>Termos de Uso</span>
            <span>Política de Privacidade</span>
            {waUrl !== '#' ? (
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                Suporte
              </a>
            ) : (
              <span>Suporte</span>
            )}
          </div>
        </div>
      </footer>

      {/* Rótulo "Fale com o suporte" ao lado do botão flutuante global do WhatsApp */}
      {waUrl !== '#' && (
        <>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nf-wa-pill"
            tabIndex={-1}
            aria-hidden="true"
          >
            Fale com o suporte
          </a>
          <span className="nf-wa-badge" aria-hidden="true">
            1
          </span>
        </>
      )}
    </div>
  );
}
