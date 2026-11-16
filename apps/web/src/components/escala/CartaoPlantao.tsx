import { Button } from '@base-ui/react/button';
import { Warning } from '@phosphor-icons/react';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { cn } from '../../lib/cn';
import { Etiqueta } from '../etiqueta/Etiqueta';

type CartaoPlantaoProps = {
  ocorrencia: OcorrenciaDto;
  /** "07:00–13:00": o horário do plantão só aparece quando é outro. */
  horarioDoTurno?: string;
  /** Mostra frente e turno (na agenda do médico, onde não há linha que diga). */
  mostrarLocal?: boolean;
  emConflito?: boolean;
  onAbrir: (ocorrencia: OcorrenciaDto) => void;
};

/** Um médico num plantão do dia: o cartão da grade, que abre o plantão no painel. */
export function CartaoPlantao({
  ocorrencia: o,
  horarioDoTurno,
  mostrarLocal = false,
  emConflito = false,
  onAbrir,
}: CartaoPlantaoProps) {
  const horario = `${o.horarioInicio}–${o.horarioFim}`;
  const mostrarHorario = mostrarLocal || horario !== horarioDoTurno;

  return (
    <Button
      type="button"
      onClick={() => onAbrir(o)}
      className={cn(
        'bg-card hover:bg-muted flex w-full min-w-0 flex-col items-start gap-1 overflow-hidden rounded-md border px-2 py-1.5 text-left text-[13px]',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
        emConflito && 'border-destructive',
      )}
    >
      <span
        className={cn(
          'w-full truncate font-medium',
          o.ausente && 'text-muted-foreground line-through',
        )}
      >
        {o.medicoNome}
      </span>
      {mostrarLocal && (
        <span className="text-muted-foreground w-full truncate">
          {o.frenteRotulo}, {o.turnoNome}
        </span>
      )}
      {(mostrarHorario || o.produtividade !== null) && (
        <span className="text-muted-foreground flex flex-wrap gap-x-2 tabular-nums">
          {mostrarHorario && <span>{horario}</span>}
          {o.produtividade !== null && (
            <span>
              {o.produtividade} {o.produtividade === 1 ? 'registro' : 'registros'}
            </span>
          )}
        </span>
      )}
      <Selos ocorrencia={o} emConflito={emConflito} />
    </Button>
  );
}

function Selos({ ocorrencia: o, emConflito }: { ocorrencia: OcorrenciaDto; emConflito: boolean }) {
  const selos = [
    emConflito && (
      <Etiqueta key="conflito" tom="erro" icone={Warning}>
        Conflito
      </Etiqueta>
    ),
    o.ausente && (
      <Etiqueta key="ausente" tom="inativo">
        {o.tipoAusenciaNome ? `Ausente: ${o.tipoAusenciaNome}` : 'Ausente'}
      </Etiqueta>
    ),
    o.cobertoPor && (
      <Etiqueta key="coberto" tom="atencao">
        Coberto por {o.cobertoPor.medicoNome}
      </Etiqueta>
    ),
    o.coberturaDe && (
      <Etiqueta key="cobrindo" tom="info">
        Cobrindo {o.coberturaDe.medicoNome}
      </Etiqueta>
    ),
    o.gratificado && (
      <Etiqueta key="gratificado" tom="sucesso">
        Gratificado
      </Etiqueta>
    ),
    o.ajustada && (
      <Etiqueta key="ajustada" tom="info">
        Ajustada
      </Etiqueta>
    ),
  ].filter(Boolean);
  if (selos.length === 0) return null;
  return <span className="flex max-w-full flex-wrap gap-1">{selos}</span>;
}
