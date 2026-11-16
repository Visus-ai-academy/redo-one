import { PreviewCard } from '@base-ui/react/preview-card';
import { useState } from 'react';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { chavePlantao } from './agrupar';
import { rotuloDia } from './calendario';
import type { ItemDescricao } from './descricao-plantao';
import { CartaoFlutuante, LinhaMedico } from './LinhaMedico';

type AgendaMedicoProps = {
  ocorrencias: readonly OcorrenciaDto[];
  conflitos: Set<string>;
  horarios: Record<string, string>;
  /** O que o cartão flutuante diz de um plantão. */
  descrever: (ocorrencia: OcorrenciaDto) => ItemDescricao[];
  onAbrir: (ocorrencia: OcorrenciaDto) => void;
};

/**
 * Por médico: os dias do mês em que ele tem plantão, em ordem; no dia, os plantões lado a lado
 * por turno, no padrão da semana (faixa na cor do turno, bolinha na cor da frente, selos e o
 * cartão ao passar o mouse). Sem o nome dele: a agenda já é dele.
 */
export function AgendaMedico({
  ocorrencias,
  conflitos,
  horarios,
  descrever,
  onAbrir,
}: AgendaMedicoProps) {
  const [cartao] = useState(() => PreviewCard.createHandle<OcorrenciaDto>());
  const porDia = new Map<string, OcorrenciaDto[]>();
  for (const o of [...ocorrencias].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.turnoOrdem - b.turnoOrdem ||
      a.turnoNome.localeCompare(b.turnoNome) ||
      a.frenteOrdem - b.frenteOrdem ||
      a.inicio.localeCompare(b.inicio),
  )) {
    porDia.set(o.data, [...(porDia.get(o.data) ?? []), o]);
  }

  if (porDia.size === 0) {
    return (
      <p className="bg-card text-muted-foreground rounded-lg border p-4">
        Nenhum plantão deste médico no mês.
      </p>
    );
  }

  return (
    <>
      <ul className="bg-card divide-y rounded-lg border">
        {[...porDia].map(([dia, plantoes]) => {
          const { semana, dia: data } = rotuloDia(dia);
          return (
            <li key={dia} className="flex flex-col gap-2 p-3 sm:flex-row sm:gap-4">
              <span className="w-24 flex-none pt-1 font-medium tabular-nums">{`${semana} ${data}`}</span>
              <ul className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                {plantoes.map((o) => (
                  <li
                    key={`${o.alocacaoId}|${o.data}`}
                    data-plantao
                    className="border-l-border overflow-hidden rounded-md border border-l-[3px]"
                    style={o.turnoCor ? { borderLeftColor: o.turnoCor } : undefined}
                  >
                    <LinhaMedico
                      ocorrencia={o}
                      horarioDoTurno={horarios[o.turnoId]}
                      emConflito={conflitos.has(chavePlantao(o.alocacaoId, o.data))}
                      local
                      cartao={cartao}
                      onAbrir={onAbrir}
                    />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <CartaoFlutuante cartao={cartao} descrever={descrever} />
    </>
  );
}
