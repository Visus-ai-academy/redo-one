import { invalida, semRepetidos } from './validacao';

/**
 * Ajuste do dia da distribuição, por alocação da escala e dia (a "exceção do robô" do
 * dashboards-one, que vira ação na tela Escala). O "+N laudos" de todos os exames NÃO entra aqui:
 * é o ajuste de produtividade do dia que a escala já tem (`ajustes_produtividade`). Aqui fica só o
 * +N de um cliente: estende o teto do médico só para os exames dele.
 */
export interface AjusteDiaEdicao {
  /** Prioridades do catálogo que o médico passa a receber além do arranjo e da Lista. */
  prioridadeIdsLiberadas: string[];
  /** Segue o SLA neste dia: o prazo mínimo das células da grade de recebimento não vale. */
  segueSla: boolean;
  /** Só os exames deste cliente; null = todos. */
  clienteId: string | null;
  /** Laudos acima do teto só para os exames do cliente; 0 = nenhum. Exige o cliente. */
  laudosExtra: number;
}

export interface AjusteDiaDistribuicao extends AjusteDiaEdicao {
  id: string;
  alocacaoId: string;
  /** "YYYY-MM-DD" (calendário de Brasília). */
  data: string;
}

/** Nada liberado, a Lista como sempre e sem extra: o ajuste não muda nada (gravar = remover). */
export const ajusteVazio = (a: AjusteDiaEdicao) =>
  !a.prioridadeIdsLiberadas.length && !a.segueSla && a.laudosExtra === 0;

/** O mesmo limite do dashboards-one. */
const MAX_LAUDOS_EXTRA = 500;

export function validarAjusteDia(a: AjusteDiaEdicao): void {
  semRepetidos(a.prioridadeIdsLiberadas, 'Há prioridade repetida no ajuste do dia.');
  if (!Number.isInteger(a.laudosExtra) || a.laudosExtra < 0 || a.laudosExtra > MAX_LAUDOS_EXTRA) {
    invalida(`Os laudos extras precisam ser um número inteiro entre 0 e ${MAX_LAUDOS_EXTRA}.`);
  }
  if (a.laudosExtra > 0 && a.clienteId === null) {
    invalida('O +N laudos de todos os exames é a produtividade do dia; aqui, escolha o cliente.');
  }
  if (a.clienteId !== null && ajusteVazio(a)) {
    invalida(
      'O cliente só recorta prioridades liberadas, "segue o SLA neste dia" ou laudos extras.',
    );
  }
}

export const canonicaAjuste = <T extends AjusteDiaEdicao>(a: T): T => ({
  ...a,
  prioridadeIdsLiberadas: [...a.prioridadeIdsLiberadas].sort(),
});
