import type { ReactNode } from 'react';

/** Moldura das telas de acesso (Entrar, Recuperar senha, Definir senha): painel verde à esquerda, conteúdo à direita. */
export function AcessoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-dvh flex-wrap">
      <section className="grade-acesso bg-sidebar text-sidebar-foreground relative flex flex-[1_1_480px] flex-col justify-between gap-8 overflow-hidden p-6 md:min-h-dvh md:p-12">
        <Desenho />
        <div className="relative flex flex-1 flex-col justify-center gap-4">
          <span className="font-brand text-sidebar-primary text-[40px] leading-none font-bold tracking-[0.12em] md:text-[88px]">
            One
          </span>
          <span className="bg-sidebar-line h-0.5 w-12" />
        </div>
        <p className="text-sidebar-muted relative max-w-[360px] text-[13px] leading-relaxed">
          Acesso restrito à equipe e aos médicos credenciados. Os acessos ficam registrados.
        </p>
      </section>

      <main className="flex flex-[999_1_420px] flex-col px-6 pt-12 pb-8">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
        <p className="text-subtle-foreground mt-6 text-center text-[13px]">
          Problemas para entrar? Fale com quem administra o One na sua equipe.
        </p>
      </main>
    </div>
  );
}

/** Anéis concêntricos com mira; o anel tracejado gira devagar e para com `prefers-reduced-motion`. */
function Desenho() {
  return (
    <svg
      width="560"
      height="560"
      viewBox="0 0 560 560"
      fill="none"
      aria-hidden="true"
      className="absolute -right-[140px] -bottom-[120px] hidden md:block"
    >
      <g stroke="currentColor" strokeWidth="1">
        <circle cx="280" cy="280" r="270" strokeOpacity="0.08" />
        <circle cx="280" cy="280" r="220" strokeOpacity="0.12" />
        <circle cx="280" cy="280" r="170" strokeOpacity="0.16" />
        <circle cx="280" cy="280" r="120" strokeOpacity="0.2" />
        <circle cx="280" cy="280" r="70" strokeOpacity="0.26" />
        <path d="M280 0v200M280 360v200M0 280h200M360 280h200" strokeOpacity="0.14" />
        <path d="M270 280h20M280 270v20" strokeOpacity="0.5" />
      </g>
      <g className="origin-[280px_280px] animate-[spin_90s_linear_infinite] motion-reduce:animate-none">
        <circle
          cx="280"
          cy="280"
          r="195"
          className="text-sidebar-line"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeDasharray="2 10"
        />
        <circle cx="280" cy="85" r="4" fill="currentColor" fillOpacity="0.7" />
      </g>
    </svg>
  );
}
