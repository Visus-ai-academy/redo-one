import { Robot } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';

const RAIO = 17;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/**
 * O robô trabalhando, discreto: o ícone dele dentro de um anel fino (eco do gantry do legado, em
 * 40px). Sem progresso conhecido (lendo a fila), um arco gira devagar; com progresso (atribuindo),
 * o anel enche na proporção real; parado (pausada), nada se mexe. Com movimento reduzido, não gira.
 */
export function RoboTrabalhando({
  rotulo,
  progresso,
  parado = false,
}: {
  rotulo: string;
  /** De 0 a 1; sem ele, o andamento é indeterminado. */
  progresso?: number;
  parado?: boolean;
}) {
  const determinado = progresso !== undefined;
  const fracao = determinado ? Math.min(1, Math.max(0, progresso)) : 0.25;
  const gira = !determinado && !parado;
  return (
    <span
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={determinado ? 0 : undefined}
      aria-valuemax={determinado ? 100 : undefined}
      aria-valuenow={determinado ? Math.round(fracao * 100) : undefined}
      aria-valuetext={determinado ? undefined : 'Em andamento'}
      className="relative flex size-10 flex-none items-center justify-center"
    >
      <svg viewBox="0 0 40 40" aria-hidden className="absolute inset-0 size-10 -rotate-90">
        <circle cx="20" cy="20" r={RAIO} fill="none" strokeWidth="2" className="stroke-border" />
        <circle
          data-arco
          cx="20"
          cy="20"
          r={RAIO}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * (1 - fracao)}
          className={cn(
            'stroke-primary origin-center',
            gira
              ? 'animate-[spin_1.6s_linear_infinite] motion-reduce:animate-none'
              : 'transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none',
          )}
        />
      </svg>
      <Robot size={20} aria-hidden className="text-primary" />
    </span>
  );
}
