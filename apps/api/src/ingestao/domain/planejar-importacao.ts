export interface LaudoExistente {
  hashConteudo: string;
  removido: boolean;
}

/** Trava contra arquivo truncado (valores de `parametros_ingestao`). */
export interface TravaRemocao {
  minimo: number;
  fator: number;
}

export interface PlanoImportacao<L> {
  inserir: L[];
  atualizar: L[];
  inalterados: number;
  /** Identidades da janela que não vieram no arquivo. */
  remover: string[];
  /** Linhas repetidas na própria planilha (mesma identidade): contam uma vez. */
  repetidas: number;
  /** Motivo da recusa; com recusa, nada é gravado. */
  recusa: string | null;
}

/**
 * Compara os laudos do arquivo com os da janela que ele cobre: novos entram, os de conteúdo
 * diferente (ou que tinham sido removidos) são atualizados e os que não vieram são removidos.
 * Recusa quando sumiria muito mais do que o arquivo traz (arquivo incompleto), como a trava do
 * dashboards-one (`substituicaoSuspeita`).
 */
export function planejarImportacao<L extends { identidade: string; hashConteudo: string }>(
  laudos: L[],
  existentes: ReadonlyMap<string, LaudoExistente>,
  trava: TravaRemocao,
): PlanoImportacao<L> {
  const vistos = new Set<string>();
  const plano: PlanoImportacao<L> = {
    inserir: [],
    atualizar: [],
    inalterados: 0,
    remover: [],
    repetidas: 0,
    recusa: null,
  };

  for (const laudo of laudos) {
    if (vistos.has(laudo.identidade)) {
      plano.repetidas++;
      continue;
    }
    vistos.add(laudo.identidade);
    const existente = existentes.get(laudo.identidade);
    if (!existente) plano.inserir.push(laudo);
    else if (existente.removido || existente.hashConteudo !== laudo.hashConteudo) {
      plano.atualizar.push(laudo);
    } else plano.inalterados++;
  }

  for (const [identidade, existente] of existentes) {
    if (!existente.removido && !vistos.has(identidade)) plano.remover.push(identidade);
  }

  const removidos = plano.remover.length;
  if (removidos > trava.minimo && removidos > trava.fator * vistos.size) {
    const linhas = `${vistos.size} linha${vistos.size === 1 ? '' : 's'}`;
    plano.recusa = `O arquivo removeria ${removidos} laudos da janela com só ${linhas}: parece incompleto. Nada foi alterado.`;
  }
  return plano;
}
