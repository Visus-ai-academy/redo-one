import { CheckCircle, EnvelopeSimple, type Icon, Lock, Prohibit } from '@phosphor-icons/react';

import type { UsuarioResumoDtoSituacaoEnumKey } from '../../gen/types/UsuarioResumoDto';
import type { TomEtiqueta } from '../etiqueta/Etiqueta';

export type Situacao = UsuarioResumoDtoSituacaoEnumKey;

/** Rótulo, cor e ícone de cada situação; a ordem é a do filtro. */
export const SITUACOES: Record<Situacao, { rotulo: string; tom: TomEtiqueta; icone: Icon }> = {
  ativo: { rotulo: 'Ativo', tom: 'sucesso', icone: CheckCircle },
  convite_pendente: { rotulo: 'Convite pendente', tom: 'atencao', icone: EnvelopeSimple },
  bloqueado: { rotulo: 'Bloqueado', tom: 'erro', icone: Lock },
  desativado: { rotulo: 'Desativado', tom: 'inativo', icone: Prohibit },
};
