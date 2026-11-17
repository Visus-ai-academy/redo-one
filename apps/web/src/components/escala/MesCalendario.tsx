import { Button } from '@base-ui/react/button';
import { useMemo } from 'react';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { cn } from '../../lib/cn';
import { contarPorDia } from './agrupar';
import {
  diaDaSemana,
  diasDaSemanaVisiveis,
  NOMES_DIAS,
  rotuloDia,
  semanasDoMes,
} from './calendario';

type MesCalendarioProps = {
  /** Qualquer dia do mês mostrado. */
  data: string;
  hoje: string;
  ocorrencias: readonly OcorrenciaDto[];
  /** Sáb e dom mesmo vazios (alternador "Fim de semana"). */
  mostrarFimDeSemana?: boolean;
  /** Clique no dia: a tela vai para a semana dele. */
  onAbrirDia: (data: string) => void;
};

/** Mês: quantos médicos em cada turno de cada dia; o dia abre a semana dele. */
export function MesCalendario({
  data,
  hoje,
  ocorrencias,
  mostrarFimDeSemana = false,
  onAbrirDia,
}: MesCalendarioProps) {
  const contagem = useMemo(() => contarPorDia(ocorrencias), [ocorrencias]);
  const mes = data.slice(0, 7);
  const semanas = useMemo(() => semanasDoMes(data), [data]);
  // Sáb e dom só viram coluna quando algum deles tem plantão (ou ausência) no mês mostrado.
  const colunas = useMemo(() => {
    const comAlgo = new Set(ocorrencias.map((o) => o.data));
    return diasDaSemanaVisiveis(semanas.flat(), (dia) => mostrarFimDeSemana || comAlgo.has(dia));
  }, [ocorrencias, semanas, mostrarFimDeSemana]);
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
        <div key={semana[0]} className="grid border-b last:border-b-0" style={grade}>
          {semana
            .filter((dia) => colunas.includes(diaDaSemana(dia)))
            .map((dia) => {
              const turnos = contagem.get(dia) ?? [];
              const total = turnos.reduce((soma, t) => soma + t.total, 0);
              const { dia: rotulo } = rotuloDia(dia);
              const nome =
                turnos.length === 0
                  ? `${rotulo}, ninguém escalado`
                  : `${rotulo}, ${turnos.map((t) => `${t.nome}: ${t.total}`).join(', ')}`;
              return (
                <Button
                  key={dia}
                  type="button"
                  aria-label={nome}
                  aria-current={dia === hoje ? 'date' : undefined}
                  onClick={() => onAbrirDia(dia)}
                  className={cn(
                    'hover:bg-muted flex min-h-16 min-w-0 flex-col items-stretch gap-1 border-l p-1.5 text-left first:border-l-0 sm:min-h-24 sm:p-2',
                    'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
                    dia.slice(0, 7) !== mes && 'bg-background text-subtle-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'text-[13px] tabular-nums',
                      dia === hoje &&
                        'bg-primary text-primary-foreground self-start rounded-full px-1.5 font-semibold',
                    )}
                  >
                    {Number(dia.slice(8))}
                  </span>
                  {total > 0 && (
                    <span className="text-muted-foreground text-xs tabular-nums sm:hidden">
                      {total}
                    </span>
                  )}
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {turnos.map((t) => (
                      <span key={t.turnoId} className="flex items-center gap-1.5 text-xs">
                        <span
                          aria-hidden
                          className="border-border size-2 flex-none rounded-full border"
                          style={t.cor ? { backgroundColor: t.cor, borderColor: t.cor } : undefined}
                        />
                        <span className="text-muted-foreground min-w-0 flex-1 truncate">
                          {t.nome}
                        </span>
                        <span className="font-medium tabular-nums">{t.total}</span>
                      </span>
                    ))}
                  </span>
                </Button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
