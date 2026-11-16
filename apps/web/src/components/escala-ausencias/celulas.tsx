import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import { BotaoAbrir } from '../cadastro/ListaCadastro';
import { periodoDaAusencia, recorteDaAusencia } from './ausencias';

/**
 * Nome do médico na lista, com a faixa lateral de 3px na cor do tipo da ausência. A cor é dado
 * (vem do tipo), por isso vai em `style`. A faixa desce até a borda esquerda da linha: a célula
 * desfaz o espaço interno da `td` (px-4, py-2) e ocupa a altura toda dela.
 */
export function CelulaMedico({
  ausencia,
  onAbrir,
}: {
  ausencia: AusenciaItemDto;
  onAbrir: () => void;
}) {
  const cor = ausencia.tipo.cor;
  return (
    <span className="relative -my-2 -ml-4 flex h-[calc(100%+1rem)] min-h-11 items-center py-2 pl-4">
      {cor && (
        <span
          data-faixa-tipo
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: cor }}
        />
      )}
      <BotaoAbrir onAbrir={onAbrir}>{ausencia.medico.nome}</BotaoAbrir>
    </span>
  );
}

/** Período da ausência e, abaixo, onde ela vale (dias, turnos, escalas) em destaque. */
export function CelulaPeriodo({ ausencia, hoje }: { ausencia: AusenciaItemDto; hoje: string }) {
  const recorte = recorteDaAusencia(ausencia);
  return (
    <span className="flex flex-col gap-1 py-1">
      <span className="whitespace-nowrap tabular-nums">{periodoDaAusencia(ausencia, hoje)}</span>
      {recorte.length > 0 && (
        <ul aria-label="Onde vale" className="flex flex-wrap gap-1">
          {recorte.map((texto) => (
            <li
              key={texto}
              className="bg-muted text-foreground rounded px-1.5 py-px text-xs font-medium"
            >
              {texto}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
