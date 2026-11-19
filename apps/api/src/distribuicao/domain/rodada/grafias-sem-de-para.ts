import {
  criarLeitorPrioridade,
  normalizarGrafia,
  type PrioridadeOperacao,
} from '../motor/prioridades-operacao';

/** Grafia de prioridade da MobileMed sem de-para: vira aviso para quem cadastra o de-para. */
export interface GrafiaSemDePara {
  /** A grafia sem acento e em maiúsculas: grafias parecidas são um aviso só. */
  chave: string;
  /** Como chegou na primeira vez nesta leitura. */
  valor: string;
  exames: number;
}

/**
 * As grafias da fila sem de-para nas prioridades da operação (uma por chave) e as do de-para, que
 * resolvem o aviso aberto antes. Só a grafia: nada do paciente.
 */
export function grafiasSemDePara(
  grafias: readonly (string | null)[],
  prioridades: readonly PrioridadeOperacao[],
): { pendentes: GrafiaSemDePara[]; conferidas: string[] } {
  const ler = criarLeitorPrioridade(prioridades);
  const porChave = new Map<string, GrafiaSemDePara>();
  for (const g of grafias) {
    const valor = g?.trim();
    if (!valor || !ler(valor).semDePara) continue;
    const chave = normalizarGrafia(valor);
    const atual = porChave.get(chave);
    if (atual) atual.exames += 1;
    else porChave.set(chave, { chave, valor, exames: 1 });
  }
  return {
    pendentes: [...porChave.values()],
    conferidas: prioridades.flatMap((p) => p.grafias.map(normalizarGrafia)),
  };
}
