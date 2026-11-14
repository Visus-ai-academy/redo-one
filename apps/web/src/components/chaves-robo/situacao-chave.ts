import { CheckCircle, Clock, type Icon, Prohibit, WarningCircle } from '@phosphor-icons/react';

import type { TomEtiqueta } from '../etiqueta/Etiqueta';

const DIA = 24 * 60 * 60 * 1000;
/** A partir de quantos dias antes de vencer a lista avisa. */
const AVISAR_COM_DIAS = 30;

export type SituacaoChave = { rotulo: string; tom: TomEtiqueta; icone: Icon; ativa: boolean };

/** Situação da chave na lista: revogada, vencida, perto de vencer ou ativa. */
export function situacaoDaChave(
  chave: { expiraEm: string | null; revogadaEm: string | null },
  agora: Date,
): SituacaoChave {
  if (chave.revogadaEm)
    return { rotulo: 'Revogada', tom: 'inativo', icone: Prohibit, ativa: false };
  if (chave.expiraEm) {
    const faltam = new Date(chave.expiraEm).getTime() - agora.getTime();
    if (faltam <= 0) return { rotulo: 'Vencida', tom: 'erro', icone: WarningCircle, ativa: false };
    const dias = Math.ceil(faltam / DIA);
    if (dias <= AVISAR_COM_DIAS) {
      const rotulo = dias === 1 ? 'Vence em 1 dia' : `Vence em ${dias} dias`;
      return { rotulo, tom: 'atencao', icone: Clock, ativa: true };
    }
  }
  return { rotulo: 'Ativa', tom: 'sucesso', icone: CheckCircle, ativa: true };
}
