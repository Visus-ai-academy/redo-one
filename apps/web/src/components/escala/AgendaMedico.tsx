import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { chavePlantao } from './agrupar';
import { CartaoPlantao } from './CartaoPlantao';
import { rotuloDia } from './calendario';

type AgendaMedicoProps = {
  ocorrencias: readonly OcorrenciaDto[];
  conflitos: Set<string>;
  horarios: Record<string, string>;
  onAbrir: (ocorrencia: OcorrenciaDto) => void;
};

/** Por médico: os dias do mês em que ele tem plantão, em ordem. */
export function AgendaMedico({ ocorrencias, conflitos, horarios, onAbrir }: AgendaMedicoProps) {
  const porDia = new Map<string, OcorrenciaDto[]>();
  for (const o of [...ocorrencias].sort(
    (a, b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio),
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
    <ul className="bg-card divide-y rounded-lg border">
      {[...porDia].map(([dia, plantoes]) => {
        const { semana, dia: data } = rotuloDia(dia);
        return (
          <li key={dia} className="flex flex-col gap-2 p-3 sm:flex-row sm:gap-4">
            <span className="w-24 flex-none pt-1.5 font-medium tabular-nums">{`${semana} ${data}`}</span>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {plantoes.map((o) => (
                <CartaoPlantao
                  key={o.alocacaoId}
                  ocorrencia={o}
                  horarioDoTurno={horarios[o.turnoId]}
                  mostrarLocal
                  emConflito={conflitos.has(chavePlantao(o.alocacaoId, o.data))}
                  onAbrir={onAbrir}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
