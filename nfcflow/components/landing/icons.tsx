import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Ico({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  );
}

export const IcArrowRight = (p: P) => (
  <Ico {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>
);
export const IcArrowUp = (p: P) => (
  <Ico {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Ico>
);
export const IcChevronDown = (p: P) => (
  <Ico {...p}><path d="m6 9 6 6 6-6" /></Ico>
);
export const IcMenu = (p: P) => (
  <Ico {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Ico>
);
export const IcClose = (p: P) => (
  <Ico {...p}><path d="M6 6l12 12M18 6 6 18" /></Ico>
);
export const IcChip = (p: P) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 10.5c.8-1.2 1.8-1.8 3-1.8s2.2.6 3 1.8M9 13.5c.8 1.2 1.8 1.8 3 1.8s2.2-.6 3-1.8" />
  </Ico>
);
export const IcWaves = (p: P) => (
  <Ico {...p}>
    <path d="M7 8.5a5 5 0 0 1 0 7M11 6a8.5 8.5 0 0 1 0 12M15 3.5a12 12 0 0 1 0 17" />
  </Ico>
);
export const IcQr = (p: P) => (
  <Ico {...p}>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
    <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5" />
  </Ico>
);
export const IcRefresh = (p: P) => (
  <Ico {...p}>
    <path d="M20 11a8 8 0 0 0-14.6-4.2L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.6 4.2L20 15.5M20 20v-4.5h-4.5" />
  </Ico>
);
export const IcCart = (p: P) => (
  <Ico {...p}>
    <path d="M3 4h2.2l2 11h10.2l1.8-8H6.2" />
    <circle cx="9" cy="19.5" r="1.4" />
    <circle cx="17" cy="19.5" r="1.4" />
  </Ico>
);
export const IcCartCheck = (p: P) => (
  <Ico {...p}>
    <path d="M3 4h2.2l2 11h10.2l1.8-8H6.2" />
    <path d="m9.8 10.2 1.8 1.8 3.2-3.4" />
    <circle cx="9" cy="19.5" r="1.4" />
    <circle cx="17" cy="19.5" r="1.4" />
  </Ico>
);
export const IcChartLine = (p: P) => (
  <Ico {...p}>
    <path d="M4 4v16h16" />
    <path d="m7.5 15 3.5-4 3 2.5 4.5-6" />
  </Ico>
);
export const IcBars = (p: P) => (
  <Ico {...p}>
    <path d="M4 4v16h16" />
    <path d="M8.5 16v-4M12.5 16V8M16.5 16v-6" />
  </Ico>
);
export const IcUsers = (p: P) => (
  <Ico {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19c.4-3 2.6-5 5.5-5s5.1 2 5.5 5" />
    <path d="M16 5.8a3 3 0 0 1 0 5.6M17.5 14.4c1.7.6 2.8 2.3 3 4.6" />
  </Ico>
);
export const IcUserSquare = (p: P) => (
  <Ico {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <circle cx="12" cy="10" r="2.6" />
    <path d="M7.5 18c.6-2.2 2.2-3.3 4.5-3.3s3.9 1.1 4.5 3.3" />
  </Ico>
);
export const IcHeadset = (p: P) => (
  <Ico {...p}>
    <path d="M4.5 13.5v-2a7.5 7.5 0 0 1 15 0v2" />
    <rect x="3.5" y="12.5" width="3.8" height="6" rx="1.6" />
    <rect x="16.7" y="12.5" width="3.8" height="6" rx="1.6" />
    <path d="M18.5 18.5c0 1.6-1.6 2.5-4 2.5h-1.5" />
  </Ico>
);
export const IcEdit = (p: P) => (
  <Ico {...p}>
    <path d="M11 4.5H7a2.5 2.5 0 0 0-2.5 2.5v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-4" />
    <path d="m9.5 14.5.6-3 7.3-7.3a1.6 1.6 0 0 1 2.3 2.3l-7.3 7.3z" />
  </Ico>
);
export const IcShieldQr = (p: P) => (
  <Ico {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.4 3 7.7 7.5 9.5 4.5-1.8 7.5-5.1 7.5-9.5V6z" />
    <rect x="9" y="8.5" width="2.6" height="2.6" rx=".5" />
    <rect x="12.6" y="8.5" width="2.6" height="2.6" rx=".5" />
    <rect x="9" y="12.1" width="2.6" height="2.6" rx=".5" />
    <path d="M13 13h2" />
  </Ico>
);
export const IcScan = (p: P) => (
  <Ico {...p}>
    <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
    <rect x="8.5" y="8.5" width="2.8" height="2.8" rx=".6" />
    <rect x="12.7" y="8.5" width="2.8" height="2.8" rx=".6" />
    <rect x="8.5" y="12.7" width="2.8" height="2.8" rx=".6" />
    <path d="M13 14.1h2.5" />
  </Ico>
);
export const IcBrowser = (p: P) => (
  <Ico {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9h17M8 6.8h.01M11 6.8h.01" />
    <path d="m9 15 2-2 1.5 1.5L16 11" />
  </Ico>
);
export const IcTouch = (p: P) => (
  <Ico {...p}>
    <path d="M9 11V6a1.8 1.8 0 0 1 3.6 0v4.2l3.6.8a2 2 0 0 1 1.5 2.4l-.9 4.6a2.5 2.5 0 0 1-2.4 2H11a2.5 2.5 0 0 1-2-1l-3-4.2a1.6 1.6 0 0 1 2.4-2z" />
    <path d="M5.5 5.5a5 5 0 0 1 2-1.6M3.8 8a8 8 0 0 1 .6-2" />
  </Ico>
);

/** "G" do Google em cores oficiais. */
export function GoogleG(p: P) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...p}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function WhatsAppGlyph(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
