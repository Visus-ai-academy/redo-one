import { PreviewCard } from '@base-ui/react/preview-card';
import { useMemo, useState } from 'react';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { chavePlantao } from './agrupar';
import { NOMES_DIAS, rotuloDia } from './calendario';
import type { ItemDescricao } from './descricao-plantao';
import { CartaoFlutuante, PlantaoDoMedico } from './LinhaMedico';
import { calendarioDoMedico, resumoDoMes } from './mes-do-medico';
import { BotaoMais } from './SemanaEscala';

type MesDoMedicoProps = {
  /** Qualquer dia do mês mostrado. */
  data: string;
  hoje: string;
  /** Os plantões do médico na grade (com os dias dos meses vizinhos). */
  ocorrencias: readonly OcorrenciaDto[];
  /** Sáb e dom mesmo vazios (alternador "Fim de semana"). */
  mostrarFimDeSemana?: boolean;
  /** `chavePlantao` dos plantões em conflito. */
  conflitos: Set<string>;
  /** Horário padrão de cada turno ("07:00–13:00"), por id. */
  horarios: Record<string, string>;
  /** O que o cartão flutuante diz de um plantão. */
  descrever: (ocorrencia: OcorrenciaDto) => ItemDescricao[];
  onAbrir: (ocorrencia: OcorrenciaDto) => void;
  /** Para o rótulo do "+". */
  medicoNome?: string;
  /** Sem ele (sem permissão de criar), não há "+". */
  onAlocar?: (data: string) => void;
};

const textoDia = (data: string) => {
  const { semana, dia } = rotuloDia(data);
  return `${semana} ${dia}`;
};

/**
 * Por médico no computador: o mês dele no formato do calendário do Mês, com os plantões de cada
 * dia no cartão da semana (faixa na cor do turno, bolinha na cor da frente, selos e o cartão ao
 * passar o mouse) e o "+" que aloca o médico no dia.
 */
export function MesDoMedico({
  data,
  hoje,
  ocorrencias,
  mostrarFimDeSemana = false,
  conflitos,
  horarios,
  descrever,
  onAbrir,
  medicoNome,
  onAlocar,
}: MesDoMedicoProps) {
  const [cartao] = useState(() => PreviewCard.createHandle<OcorrenciaDto>());
  const { colunas, semanas } = useMemo(
    () => calendarioDoMedico({ data, ocorrencias, mostrarFimDeSemana }),
    [data, ocorrencias, mostrarFimDeSemana],
  );
  const grade = { gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` };

  return (
    <div className="bg-card rounded-lg border">
      <div className="text-subtle-foreground grid border-b text-xs font-medium" style={grade}>
        {colunas.map((dia) => (
          <span key={dia} className="px-2 py-2">
            {NOMES_DIAS[dia]}
          </span>
        ))}
      </div>
      {semanas.map((semana) => (
        <div key={semana[0]?.data} className="grid border-b last:border-b-0" style={grade}>
          {semana.map(({ data: dia, doMes, plantoes }) => (
            <div
              key={dia}
              data-dia={dia}
              data-fora-do-mes={doMes ? undefined : ''}
              aria-current={dia === hoje ? 'date' : undefined}
              className={cn(
                'flex min-h-24 min-w-0 flex-col gap-1.5 border-l p-1.5 first:border-l-0',
                !doMes && 'bg-background text-subtle-foreground',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    'text-[13px] tabular-nums',
                    dia === hoje &&
                      'bg-primary text-primary-foreground rounded-full px-1.5 font-semibold',
                  )}
                >
                  {Number(dia.slice(8))}
                </span>
                {onAlocar && (
                  <BotaoMais
                    rotulo={`Alocar ${medicoNome ?? 'médico'} em ${textoDia(dia)}`}
                    onClick={() => onAlocar(dia)}
                    className="size-6 w-6"
                  />
                )}
              </div>
              {plantoes.length > 0 && (
                <ul aria-label={textoDia(dia)} className="flex flex-col gap-1">
                  {plantoes.map((o) => (
                    <PlantaoDoMedico
                      key={`${o.alocacaoId}|${o.data}`}
                      ocorrencia={o}
                      horarioDoTurno={horarios[o.turnoId]}
                      emConflito={conflitos.has(chavePlantao(o.alocacaoId, o.data))}
                      cartao={cartao}
                      onAbrir={onAbrir}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
      <CartaoFlutuante cartao={cartao} descrever={descrever} />
    </div>
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O topo do Por médico: quantos plantões no mês e, em linha, cada frente, turno e horário com os
 * dias da semana e quantos plantões.
 */
export function ResumoDoMes({
  data,
  ocorrencias,
}: {
  data: string;
  ocorrencias: readonly OcorrenciaDto[];
}) {
  const { total, linhas } = useMemo(() => resumoDoMes(ocorrencias, data), [ocorrencias, data]);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <span className="text-sm font-semibold tabular-nums">
        {total === 0 ? 'Nenhum plantão no mês' : `${plural(total, 'plantão', 'plantões')} no mês`}
      </span>
      {linhas.length > 0 && (
        <ul aria-label="Plantões do mês" className="flex flex-wrap gap-x-4 gap-y-1">
          {linhas.map((l) => (
            <li key={l.chave} className="flex items-center gap-1.5">
              <BolinhaCor cor={l.frenteCor} />
              <span className="font-medium">{l.frente}</span>
              <BolinhaCor cor={l.turnoCor} className="ml-1" />
              <span className="font-medium">{l.turno}</span>
              <span className="text-muted-foreground tabular-nums">
                {`${l.dias}, ${l.horario} · ${plural(l.plantoes, 'plantão', 'plantões')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
