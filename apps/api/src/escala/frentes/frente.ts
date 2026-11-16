import { EscalaInvalidaError } from '../domain/errors';

/** A frente aponta para uma especialidade (NEURO) ou para uma modalidade (RX, TC), nunca as duas. */
export type TipoFrente = 'especialidade' | 'modalidade';

/** O item do catálogo para onde a frente aponta. */
export interface DestinoFrente {
  tipo: TipoFrente;
  id: string;
}

export interface ApontamentoFrente {
  tipo: TipoFrente;
  especialidadeId: string | null;
  modalidadeId: string | null;
}

/** Confere que a frente aponta para exatamente um item, e do tipo dela. */
export function destinoDaFrente(dados: ApontamentoFrente): DestinoFrente {
  const [proprio, outro] =
    dados.tipo === 'especialidade'
      ? [dados.especialidadeId, dados.modalidadeId]
      : [dados.modalidadeId, dados.especialidadeId];
  if (!proprio || outro) {
    const qual = dados.tipo === 'especialidade' ? 'uma especialidade' : 'uma modalidade';
    throw new EscalaInvalidaError(`A frente de ${dados.tipo} precisa de ${qual}, e só dela.`);
  }
  return { tipo: dados.tipo, id: proprio };
}
