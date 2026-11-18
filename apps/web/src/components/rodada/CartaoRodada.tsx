import type { ReactNode } from 'react';

import type { RodadaDto } from '../../gen/types/RodadaDto';
import {
  descreverRecortes,
  etapasDaRodada,
  situacaoDaRodada,
  tituloDaRodada,
} from '../../lib/rodada';
import { Etapas } from '../etapas/Etapas';
import { Etiqueta } from '../etiqueta/Etiqueta';

/** Quem pediu e quem aprovou, numa frase. */
function quem(r: Pick<RodadaDto, 'solicitadaPor' | 'aprovadaPor'>) {
  const pediu = r.solicitadaPor?.nome;
  const aprovou = r.aprovadaPor?.nome;
  if (pediu && aprovou && pediu === aprovou) return `Pedida e aprovada por ${pediu}`;
  return [pediu && `Pedida por ${pediu}`, aprovou && `aprovada por ${aprovou}`]
    .filter(Boolean)
    .join(', ');
}

/**
 * O cabeçalho da rodada viva: título, situação, quem pediu, as etapas e (antes de executar) os
 * recortes; as ações ficam à direita, conforme a etapa e as permissões de quem vê.
 */
export function CartaoRodada({
  rodada,
  nomes,
  acoes,
  mostrarRecortes,
  children,
}: {
  rodada: RodadaDto;
  /** Id → nome (turnos, frentes, prioridades, médicos) para os recortes. */
  nomes: ReadonlyMap<string, string>;
  acoes?: ReactNode;
  mostrarRecortes?: boolean;
  /** Abaixo das etapas (ex.: o aviso de quem só acompanha, a explicação do parcial). */
  children?: ReactNode;
}) {
  const s = situacaoDaRodada(rodada.status);
  return (
    <section
      aria-label={`Rodada ${s.texto.toLowerCase()}`}
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold tabular-nums">
            {tituloDaRodada(rodada.criadoEm)}
          </h2>
          <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>
          <span className="text-muted-foreground text-[13px]">{quem(rodada)}</span>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      <Etapas aria-label="Etapas da rodada" etapas={etapasDaRodada(rodada)} />
      {mostrarRecortes && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-3 text-[13px] sm:grid-cols-2 lg:grid-cols-5">
          {descreverRecortes(rodada.recortes, nomes).map((r) => (
            <div key={r.rotulo} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-subtle-foreground text-xs">{r.rotulo}</dt>
              <dd className="break-words">{r.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}
