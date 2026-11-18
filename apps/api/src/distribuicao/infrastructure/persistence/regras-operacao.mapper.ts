import type { RegraRecebimento, RegraUrgencia } from '../../domain/motor/prioridades-operacao';

/** Regra de urgência ↔ colunas (`urgencia`, `urgencia_horas`). */
export function urgenciaDa(l: {
  urgencia: 'nunca' | 'sempre' | 'prazo';
  urgenciaHoras: number | null;
}): RegraUrgencia {
  return l.urgencia === 'prazo'
    ? { tipo: 'prazo', horas: l.urgenciaHoras ?? 0 }
    : { tipo: l.urgencia };
}

export const linhaDaUrgencia = (u: RegraUrgencia) => ({
  urgencia: u.tipo,
  urgenciaHoras: u.tipo === 'prazo' ? u.horas : null,
});

/** Regra de recebimento ↔ colunas (`regra`, `prazo_minimo_horas`). */
export function regraRecebimentoDa(l: {
  regra: 'segue_sla' | 'prazo_minimo' | 'nao_recebe';
  prazoMinimoHoras: number | null;
}): RegraRecebimento {
  return l.regra === 'prazo_minimo'
    ? { tipo: 'prazo_minimo', horas: l.prazoMinimoHoras ?? 0 }
    : { tipo: l.regra };
}

export const linhaDaRegraRecebimento = (r: RegraRecebimento) => ({
  regra: r.tipo,
  prazoMinimoHoras: r.tipo === 'prazo_minimo' ? r.horas : null,
});
