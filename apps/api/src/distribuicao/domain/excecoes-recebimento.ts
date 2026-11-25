import type { FrenteEscala } from './arranjo';
import { type ExcecaoRecebimento, especificidade } from './motor/prioridades-operacao';
import { validarRegraRecebimento } from './prioridades-operacao';
import { invalida, validarData } from './validacao';

/**
 * Exceções temporárias da grade de recebimento (Configurações › Distribuição). O motor lê
 * `ExcecaoRecebimento`; aqui ficam as invariantes do cadastro. A exceção encerrada fica no
 * histórico: encerrar é trazer o fim para ontem, nunca apagar.
 */

export type EdicaoExcecaoRecebimento = Omit<ExcecaoRecebimento, 'id' | 'criadoEm'>;

export type SituacaoExcecao = 'futura' | 'vigente' | 'encerrada';

const LIMITE_DIAS = 366;
const DIA_MS = 86_400_000;

const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);

/** O dia do calendário de Brasília (UTC−3 fixo, invariante do domínio). */
export const diaEmBrasilia = (d: Date) =>
  new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

export const diaAnterior = (dia: string) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) - DIA_MS).toISOString().slice(0, 10);

export function validarExcecao(e: EdicaoExcecaoRecebimento): void {
  validarData(e.de, 'Início');
  validarData(e.ate, 'Fim');
  if (e.ate < e.de) invalida('O fim não pode ser antes do início.');
  if (diasEntre(e.de, e.ate) + 1 > LIMITE_DIAS) {
    invalida(`A exceção vale por até ${LIMITE_DIAS} dias; para mais, mude a grade.`);
  }
  validarRegraRecebimento(e.regra);
}

export function situacaoExcecao(
  e: Pick<ExcecaoRecebimento, 'de' | 'ate'>,
  hoje: string,
): SituacaoExcecao {
  if (e.de > hoje) return 'futura';
  return e.ate < hoje ? 'encerrada' : 'vigente';
}

/**
 * Regras de mudança no tempo: a nova não começa no passado; a encerrada não muda; a vigente
 * mantém o início que já passou e pode ter o fim trazido até ontem (encerrar).
 */
export function validarEdicaoExcecao(
  atual: ExcecaoRecebimento | null,
  nova: EdicaoExcecaoRecebimento,
  hoje: string,
): void {
  validarExcecao(nova);
  const situacao = atual ? situacaoExcecao(atual, hoje) : 'futura';
  if (situacao === 'encerrada') {
    invalida('A exceção encerrada fica no histórico e não muda. Crie uma nova.');
  }
  if (atual && situacao === 'vigente' && atual.de < hoje) {
    if (nova.de !== atual.de) invalida('Não dá para mudar o início de uma exceção que já começou.');
    if (nova.ate < diaAnterior(hoje)) {
      invalida('O fim não pode ser antes de ontem: o que já passou fica no histórico.');
    }
    return;
  }
  if (nova.de < hoje) invalida('A exceção não pode começar antes de hoje.');
}

/** Só a que ainda não valeu em dia passado (futura ou que começa hoje); as outras se encerram. */
export const podeExcluir = (e: Pick<ExcecaoRecebimento, 'de'>, hoje: string) => e.de >= hoje;

const frentesSeCruzam = (a: FrenteEscala | null, b: FrenteEscala | null) =>
  a === null ||
  b === null ||
  (a.tipo === b.tipo &&
    a.especialidadeId === b.especialidadeId &&
    a.modalidadeId === b.modalidadeId);

/**
 * As outras que empatam com esta em algum exame: mesmo turno, períodos que se tocam, recortes que
 * se cruzam e a mesma especificidade. No empate vale a criada por último; a tela avisa.
 */
export function empates(
  e: ExcecaoRecebimento,
  todas: readonly ExcecaoRecebimento[],
): ExcecaoRecebimento[] {
  return todas.filter(
    (o) =>
      o.id !== e.id &&
      o.turnoId === e.turnoId &&
      o.de <= e.ate &&
      e.de <= o.ate &&
      especificidade(o) === especificidade(e) &&
      frentesSeCruzam(o.frente, e.frente) &&
      (o.prioridadeOperacaoId === null ||
        e.prioridadeOperacaoId === null ||
        o.prioridadeOperacaoId === e.prioridadeOperacaoId),
  );
}
