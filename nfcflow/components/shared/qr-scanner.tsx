'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CameraOff, Loader2 } from 'lucide-react';

interface Props {
  onResult: (text: string) => void;
  active?: boolean;
}

/** Leitor de QR Code pela câmera traseira do celular (jsQR + getUserMedia). Requer HTTPS. */
export function QrScanner({ onResult, active = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const handled = useRef(false);

  useEffect(() => {
    if (!active) return;
    handled.current = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const video = videoRef.current;
      if (cancelled || !video || !ctx) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.floor(video.videoWidth * scale);
        canvas.height = Math.floor(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data && !handled.current) {
          handled.current = true;
          onResult(code.data);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (typeof window !== 'undefined' && window.isSecureContext === false) {
          throw Object.assign(new Error('insecure'), { name: 'SecurityError' });
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('unsupported');
        }
        // câmera traseira; se o aparelho não aceitar a restrição, tenta qualquer câmera (compatibilidade com celulares)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch (first) {
          const n = first instanceof Error ? first.name : '';
          if (n === 'NotAllowedError' || n === 'SecurityError') throw first;
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        // iOS/Safari só reproduz sem toque se estiver mudo e inline (o atributo muted do React não basta)
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.srcObject = stream;
        await video.play();
        setStarting(false);
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador e tente de novo, ou digite o código manualmente.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'Nenhuma câmera encontrada neste dispositivo. Digite o código manualmente.'
              : name === 'NotReadableError'
                ? 'A câmera está em uso por outro aplicativo. Feche-o e tente de novo.'
                : 'Não foi possível acessar a câmera neste dispositivo/navegador (é necessário HTTPS). Digite o código manualmente.'
        );
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onResult é lido a cada leitura; evitar reiniciar a câmera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
        <CameraOff className="h-8 w-8" />
        {error}
      </div>
    );
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-black">
      <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
    </div>
  );
}
