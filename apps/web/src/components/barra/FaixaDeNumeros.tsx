import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type NumeroDaFaixa = {
  rotulo: string;
  valor: ReactNode;
  /** Ao lado do valor (ex.: a etiqueta "O primeiro às 10:52"). */
  extra?: ReactNode;
  legenda?: ReactNode;
};

/**
 * Faixa de poucos números do momento (fila, proposta, resultado) num só painel, separados por
 * divisória; duas colunas no celular e até cinco no computador. Não é "métrica herói": número de 22px com rótulo e
 * legenda curta.
 */
export function FaixaDeNumeros({
  numeros,
  'aria-label': ariaLabel,
  className,
}: {
  numeros: readonly NumeroDaFaixa[];
  'aria-label'?: string;
  className?: string;
}) {
  return (
    <dl
      aria-label={ariaLabel}
      className={cn(
        'bg-card grid grid-cols-2 overflow-hidden rounded-lg border',
        numeros.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
        className,
      )}
    >
      {numeros.map((n) => (
        <div
          key={n.rotulo}
          className="-mt-px -ml-px flex min-w-0 flex-col gap-1 border-t border-l p-4 last:odd:col-span-2 xl:last:odd:col-span-1"
        >
          <dt className="text-muted-foreground text-[13px]">{n.rotulo}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="text-[22px] leading-7 font-semibold tabular-nums">{n.valor}</span>
            {n.extra}
          </dd>
          {n.legenda && (
            <dd className="text-subtle-foreground text-xs tabular-nums">{n.legenda}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
