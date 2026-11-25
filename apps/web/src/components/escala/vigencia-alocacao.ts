import type { VigenciaAlocacaoKey } from '../../gen/types/VigenciaAlocacao';
import { dataCurta, NOMES_DIAS } from './calendario';

/** O que a descrição lê da alocação do plantão. */
export type VigenciaDoPlantao = {
  vigencia: VigenciaAlocacaoKey;
  gratificado: boolean;
  coberturaDe: { medicoNome: string } | null;
  dataInicio: string;
  dataFim: string | null;
};

export type RepeticaoDoPlantao = {
  diasSemana: readonly number[];
  semanasDoMes: readonly number[];
};

/** "A, B e C". */
function emLista(itens: readonly string[]) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

/**
 * "Escala fixa desde 09/09/2026, sem data de fim", "Escala fixa de 09/09/2026 até 31/12/2026",
 * "Período único de … até …", "Gratificado de … até …" ou "Cobrindo Ana de … até …". A fixa com
 * fim (marcada ou encerrada) continua escala fixa: o tipo vem da vigência, não do fim.
 */
export function descreverVigencia(o: VigenciaDoPlantao) {
  const tipo = o.coberturaDe
    ? `Cobrindo ${o.coberturaDe.medicoNome}`
    : o.gratificado
      ? 'Gratificado'
      : o.vigencia === 'fixa'
        ? 'Escala fixa'
        : 'Período único';
  if (!o.dataFim) return `${tipo} desde ${dataCurta(o.dataInicio)}, sem data de fim`;
  return `${tipo} de ${dataCurta(o.dataInicio)} até ${dataCurta(o.dataFim)}`;
}

/** Segunda primeiro, como na escala. */
const ordemDoDia = (d: number) => (d === 0 ? 7 : d);
const ordemDaSemana = (s: number) => (s < 0 ? 9 : s);

/** "seg, qua e sex, toda semana" ou "seg, na 1ª e última semana do mês". */
export function descreverRepeticao(o: RepeticaoDoPlantao) {
  const dias =
    new Set(o.diasSemana).size === 7
      ? 'todos os dias'
      : emLista(
          [...new Set(o.diasSemana)]
            .sort((a, b) => ordemDoDia(a) - ordemDoDia(b))
            .map((d) => (NOMES_DIAS[d] ?? '').toLowerCase()),
        );
  if (o.semanasDoMes.length === 0) return `${dias}, toda semana`;
  const semanas = [...new Set(o.semanasDoMes)]
    .sort((a, b) => ordemDaSemana(a) - ordemDaSemana(b))
    .map((s) => (s < 0 ? 'última' : `${s}ª`));
  return `${dias}, na ${emLista(semanas)} semana do mês`;
}
