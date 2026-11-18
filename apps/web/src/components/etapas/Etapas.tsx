import { CheckCircle } from '@phosphor-icons/react';
import { Fragment } from 'react';

import { cn } from '../../lib/cn';

export type EtapaDoFluxo = { rotulo: string; estado: 'feito' | 'agora' | 'futuro' };

/**
 * As etapas de um fluxo em linha (pedida → lida → aprovada → executada): as feitas com o check, a
 * de agora em destaque (`aria-current="step"`), as que faltam esmaecidas. Quebra linha no celular.
 */
export function Etapas({
  etapas,
  'aria-label': ariaLabel,
}: {
  etapas: readonly EtapaDoFluxo[];
  'aria-label': string;
}) {
  return (
    <ol aria-label={ariaLabel} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      {etapas.map((e, i) => (
        <Fragment key={e.rotulo}>
          {i > 0 && <li aria-hidden className="bg-border h-px w-4 flex-none sm:w-6" />}
          <li
            aria-current={e.estado === 'agora' ? 'step' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums',
              e.estado === 'feito' && 'text-muted-foreground',
              e.estado === 'agora' && 'text-foreground font-semibold',
              e.estado === 'futuro' && 'text-subtle-foreground',
            )}
          >
            {e.estado === 'feito' ? (
              <CheckCircle size={16} aria-hidden className="text-success" />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  e.estado === 'agora' ? 'bg-primary ring-primary/20 ring-4' : 'bg-input',
                )}
              />
            )}
            {e.rotulo}
            {e.estado === 'feito' && <span className="sr-only"> (feito)</span>}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
