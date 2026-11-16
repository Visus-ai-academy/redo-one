import { type ReactNode, useId } from 'react';

import { cn } from '../../lib/cn';

type PainelProps = {
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Ação do cabeçalho, à direita (ex.: "Encerrar as outras"). */
  acao?: ReactNode;
  id?: string;
  children: ReactNode;
  /** Tabela ou lista com divisórias: o conteúdo encosta nas bordas, sem o espaço de 16px. */
  conteudoNaBorda?: boolean;
  className?: string;
};

/**
 * Bloco de conteúdo com título: superfície branca, borda de 1px, raio de 8px, sem sombra. O
 * conteúdo ganha 16px de espaço interno (formulário, texto); tabela passa `conteudoNaBorda`.
 */
export function Painel({
  titulo,
  descricao,
  acao,
  id,
  children,
  conteudoNaBorda,
  className,
}: PainelProps) {
  const tituloId = useId();

  return (
    <section
      id={id}
      aria-labelledby={tituloId}
      className={cn('bg-card scroll-mt-20 rounded-lg border md:scroll-mt-6', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="flex flex-col gap-1">
          <h2 id={tituloId} className="text-base font-semibold">
            {titulo}
          </h2>
          {descricao && <p className="text-muted-foreground text-[13px]">{descricao}</p>}
        </div>
        {acao}
      </div>
      {conteudoNaBorda ? children : <div className="p-4">{children}</div>}
    </section>
  );
}
