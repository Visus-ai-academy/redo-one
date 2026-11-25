import { invalida, semRepetidos, validarData } from './validacao';

/**
 * Ajuste do dia da distribuição, por alocação da escala e dia (a "exceção do robô" do
 * dashboards-one, que vira ação na tela Escala). O "+N laudos" de todos os exames NÃO entra aqui:
 * é o ajuste de produtividade do dia que a escala já tem (`ajustes_produtividade`). Aqui fica só o
 * +N de um cliente: estende o teto do médico só para os exames dele.
 */
export interface AjusteDiaEdicao {
  /** Prioridades da operação que o médico passa a receber além do arranjo e da alocação. */
  prioridadeIdsLiberadas: string[];
  /** Segue o SLA neste dia: o prazo mínimo das células da grade de recebimento não vale. */
  segueSla: boolean;
  /** Vale para os exames de todos os clientes (com `clienteId` null). Vazio nunca é "todos". */
  todosClientes: boolean;
  /** Sem `todosClientes`: só os exames deste cliente. */
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
  // Vazio nunca é "todos" (25/11/2026): ou "todos os clientes", ou o cliente.
  if (a.todosClientes && a.clienteId !== null) {
    invalida('Escolha "todos os clientes" ou um cliente, não as duas coisas.');
  }
  if (!a.todosClientes && a.clienteId === null) invalida('Escolha o cliente (ou "todos").');
  if (a.laudosExtra > 0 && a.todosClientes) {
    invalida('O +N laudos de todos os exames é a produtividade do dia; aqui, escolha o cliente.');
  }
  if (!a.todosClientes && ajusteVazio(a)) {
    invalida(
      'O cliente só recorta prioridades liberadas, "segue o SLA neste dia" ou laudos extras.',
    );
  }
}

export const canonicaAjuste = <T extends AjusteDiaEdicao>(a: T): T => ({
  ...a,
  prioridadeIdsLiberadas: [...a.prioridadeIdsLiberadas].sort(),
});

/**
 * Até quantos dias (com o dia aberto) um ajuste pode ser gravado de uma vez pelo "Até". Proteção
 * técnica, não regra do negócio: cada dia vira uma linha e um evento de auditoria numa transação
 * só, e o ajuste é uma exceção (para mais tempo, a alocação ou o arranjo é que mudam). Um mês.
 */
export const MAX_DIAS_PERIODO_AJUSTE = 31;

const DIA_MS = 86_400_000;
const somarDias = (data: string, dias: number) =>
  new Date(Date.parse(`${data}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
const formatar = (data: string) => data.split('-').reverse().join('/');

/** O último "Até" aceito a partir do dia aberto. */
export const ateMaximoDoAjuste = (data: string) => somarDias(data, MAX_DIAS_PERIODO_AJUSTE - 1);

/**
 * Os dias de [data, ate], com as duas pontas ("YYYY-MM-DD", calendário de Brasília). "Até" não
 * vem antes do dia aberto nem passa do limite.
 */
export function diasDoPeriodoAjuste(data: string, ate: string): string[] {
  validarData(data);
  validarData(ate, 'Até');
  if (ate < data) invalida(`"Até" não pode ser antes do dia aberto (${formatar(data)}).`);
  if (ate > ateMaximoDoAjuste(data)) {
    invalida(
      `O ajuste vale por até ${MAX_DIAS_PERIODO_AJUSTE} dias de uma vez: escolha "Até" até ${formatar(ateMaximoDoAjuste(data))}.`,
    );
  }
  const dias: string[] = [];
  for (let d = data; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}
