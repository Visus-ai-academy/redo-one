import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { OrigemAusencia, SituacaoAusencia } from '../domain';
import type { DadosAusenciaGravada } from './ausencias.repository';

export type AcaoAusencia =
  | 'criada'
  | 'alterada'
  | 'excluida'
  | 'aprovada'
  | 'recusada'
  | 'solicitada'
  | 'cancelada';

/** O que o evento leva da ausência. */
export interface FotoAusencia extends DadosAusenciaGravada {
  situacao: SituacaoAusencia;
  origem: OrigemAusencia;
}

/**
 * Campos do evento. LGPD: `observacoes` (saúde) e o motivo da recusa nunca vão para o histórico,
 * que quem tem `escala.historico.ver` lê; só a marca de que mudaram. `medicoId`, `frenteIds` e
 * `turnoIds` vão sempre (o histórico filtra e recorta por eles; ver `auditoria-escala.ts`).
 */
export function camposDoEvento({ observacoes: _, ...foto }: FotoAusencia): Record<string, unknown> {
  return { ...foto };
}

const contexto = (foto: FotoAusencia) => ({
  medicoId: foto.medicoId,
  frenteIds: foto.frenteIds,
  turnoIds: foto.turnoIds,
});

/** Só os campos que mudaram, mais o contexto; `null` se nada mudou. */
export function diferenca(
  antes: FotoAusencia,
  depois: FotoAusencia,
): { antes: Record<string, unknown>; depois: Record<string, unknown> } | null {
  const de = camposDoEvento(antes);
  const para = camposDoEvento(depois);
  const mudou = Object.keys(para).filter((c) => JSON.stringify(de[c]) !== JSON.stringify(para[c]));
  const observacoesAlteradas = (antes.observacoes ?? null) !== (depois.observacoes ?? null);
  if (!mudou.length && !observacoesAlteradas) return null;
  const recorte = (campos: Record<string, unknown>) =>
    Object.fromEntries(mudou.map((c) => [c, campos[c]]));
  return {
    antes: { ...contexto(antes), ...recorte(de) },
    depois: {
      ...contexto(depois),
      ...recorte(para),
      ...(observacoesAlteradas ? { observacoesAlteradas: true } : {}),
    },
  };
}

export function eventoAusencia(
  usuarioId: string,
  id: string,
  acao: AcaoAusencia,
  em: Date,
  campos: { antes?: Record<string, unknown>; depois?: Record<string, unknown> },
): EventoAuditoria {
  return {
    ator: { tipo: 'usuario', id: usuarioId },
    entidade: 'ausencia',
    entidadeId: id,
    acao,
    ...campos,
    em,
  };
}

/** Evento de criação: a foto, com a marca de observações informadas. */
export function camposDeCriacao(foto: FotoAusencia): Record<string, unknown> {
  return { ...camposDoEvento(foto), ...(foto.observacoes ? { observacoesAlteradas: true } : {}) };
}

/** Evento de aprovação ou recusa: só a situação (e a marca do motivo), mais o contexto. */
export function camposDeRevisao(foto: FotoAusencia, nova: SituacaoAusencia) {
  return {
    antes: { ...contexto(foto), situacao: foto.situacao },
    depois: {
      ...contexto(foto),
      situacao: nova,
      ...(nova === 'recusada' ? { motivoRecusaAlterado: true } : {}),
    },
  };
}
