import { Cpu } from 'lucide-react';
import { NxBrand } from '@/components/shell/nx-brand';
import './neon.css';

/**
 * Moldura visual compartilhada por Login e Cadastro (somente layout):
 * desktop = hero da marca + cartão do formulário; celular/tablet = cartão centralizado.
 */
export function AuthShell({
  tagline,
  children,
}: {
  tagline: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nx-root text-[#f4f2fb]">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1240px] items-center gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1.05fr_minmax(0,460px)] lg:gap-14 lg:px-10 xl:gap-20">
        {/* HERO — apenas em telas grandes */}
        <section className="nx-rise hidden flex-col gap-6 lg:flex">
          <NxBrand markClassName="h-8" textClassName="text-3xl" />
          <span className="nx-pill w-fit">
            <Cpu className="h-3.5 w-3.5 text-[#a98bff]" /> Tecnologia que conecta
          </span>
          <h2 className="text-5xl font-extrabold leading-[1.05] tracking-tight xl:text-6xl">
            Transforme
            <br />
            visitas em clientes
            <br />
            com apenas <span className="nx-gradient-text">um toque.</span>
          </h2>
          <p className="max-w-md text-base leading-relaxed text-[#b7b2cc]">
            Plaquinhas NFC e QR Code que levam seus clientes direto para o seu Google, redes
            sociais e muito mais.
          </p>
          <div className="nx-hero-photo nx-float mt-2 max-w-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/hero-nfc.jpg"
              alt="Plaquinha NFCFLOW ao lado de um celular mostrando avaliações do Google"
              width={1600}
              height={1205}
              className="block h-auto w-full"
            />
          </div>
        </section>

        {/* FORMULÁRIO */}
        <section className="nx-rise mx-auto w-full max-w-md lg:max-w-none">
          <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
            <NxBrand markClassName="h-8" textClassName="text-3xl" />
            <p className="text-sm text-[#b7b2cc]">{tagline}</p>
          </div>

          <div className="nx-glass rounded-3xl p-6 sm:p-8">{children}</div>

          <p className="mt-6 text-center text-xs text-[#8c86a6]">
            © {new Date().getFullYear()} NFCFLOW. Todos os direitos reservados.
          </p>
        </section>
      </div>
    </div>
  );
}
