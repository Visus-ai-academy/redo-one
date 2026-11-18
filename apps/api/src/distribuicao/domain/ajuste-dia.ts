import { invalida, semRepetidos } from './validacao';

/**
 * Ajuste do dia da distribuição, por alocação da escala e dia (a "exceção do robô" do
 * dashboards-one, que vira ação na tela Escala). O "+N laudos" NÃO entra aqui: é o ajuste de
 * produtividade do dia que a escala já tem (`ajustes_produtividade`), e o motor já lê a
 * produtividade do dia com ele. No motor, `AjusteDia.laudosExtra` = 0.
 */
export interface AjusteDiaEdicao {
  /** Prioridades do catálogo que o médico passa a receber além do arranjo e da Lista. */
  prioridadeIdsLiberadas: string[];
  /** A Lista dele segue o SLA (qualquer prioridade aceita, sem prazo mínimo). */
  listaSegueSla: boolean;
  /** Só os exames deste cliente; null = todos. */
  clienteId: string | null;
}

export interface AjusteDiaDistribuicao extends AjusteDiaEdicao {
  id: string;
  alocacaoId: string;
  /** "YYYY-MM-DD" (calendário de Brasília). */
  data: string;
}

/** Nada liberado e a Lista como sempre: o ajuste não muda nada (gravar = remover). */
export const ajusteVazio = (a: AjusteDiaEdicao) =>
  !a.prioridadeIdsLiberadas.length && !a.listaSegueSla;

export function validarAjusteDia(a: AjusteDiaEdicao): void {
  semRepetidos(a.prioridadeIdsLiberadas, 'Há prioridade repetida no ajuste do dia.');
  if (a.clienteId !== null && ajusteVazio(a)) {
    invalida('O cliente só recorta prioridades liberadas ou "a Lista segue o SLA".');
  }
}

export const canonicaAjuste = <T extends AjusteDiaEdicao>(a: T): T => ({
  ...a,
  prioridadeIdsLiberadas: [...a.prioridadeIdsLiberadas].sort(),
});
