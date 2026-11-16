import type { Readable } from 'node:stream';

import { readSheet } from 'read-excel-file/node';

import {
  type LeitorPlanilha,
  PlanilhaInvalidaError,
  type PlanilhaLida,
} from '../../application/ports/leitor-planilha';
import type { Celula } from '../../domain/celulas';

/** Marca da planilha "Compartilhamento de exames" (CRD_APOIO): a empresa vem nesta coluna. */
const MARCA_COMPARTILHAMENTO = 'COMPARTILHAMENTO_ENVIADO_PARA';

/** Nome alternativo → nome da coluna no relatório de laudos. */
const ALIASES: Record<string, string> = {
  [MARCA_COMPARTILHAMENTO]: 'EMPRESA',
  COMPLEMENTO: 'COMPLEMENTAR',
};

/** Colunas que a importação lê (as outras ficam só na linha crua). */
const OBRIGATORIAS = [
  'EMPRESA',
  'NOME_PACIENTE',
  'CODIGO_PACIENTE',
  'ESTUDO_DESCRICAO',
  'ACCESSION_NUMBER',
  'MODALIDADE',
  'PRIORIDADE',
  'VALORES',
  'ESPECIALIDADE',
  'MEDICO',
  'DUPLICADO',
  'DATA_REALIZACAO',
  'HORA_REALIZACAO',
  'DATA_TRANSFERENCIA',
  'HORA_TRANSFERENCIA',
  'DATA_LAUDO',
  'HORA_LAUDO',
  'DATA_PRAZO',
  'HORA_PRAZO',
  'STATUS',
  'DATA_REASSINATURA',
  'HORA_REASSINATURA',
  'MEDICO_REASSINATURA',
  'COMPLEMENTAR',
];

/** A planilha de compartilhamento não traz a especialidade. */
const DISPENSAVEIS_NO_COMPARTILHAMENTO = new Set(['ESPECIALIDADE']);

const vazia = (c: Celula) => c === null || c === undefined || (typeof c === 'string' && !c.trim());

/**
 * Lê o relatório "Descritivo Especialidades" (ou o de compartilhamento) da MobileMed: primeira aba,
 * cabeçalho na linha 1, como o dashboards-one. ~80 mil linhas cabem em ~100 MB de memória.
 */
export class XlsxLeitorPlanilha implements LeitorPlanilha {
  async ler(conteudo: Readable): Promise<PlanilhaLida> {
    const [cabecalho = [], ...linhas] = (await readSheet(conteudo)) as Celula[][];

    const colunas = new Map<string, number>();
    cabecalho.forEach((c, i) => {
      const nome = String(c ?? '')
        .trim()
        .toUpperCase();
      if (nome && !colunas.has(nome)) colunas.set(nome, i);
    });
    const formato = colunas.has(MARCA_COMPARTILHAMENTO) ? 'compartilhamento' : 'laudos';
    for (const [alias, nome] of Object.entries(ALIASES)) {
      const i = colunas.get(alias);
      if (i !== undefined && !colunas.has(nome)) colunas.set(nome, i);
    }

    const faltam = OBRIGATORIAS.filter(
      (c) =>
        !colunas.has(c) &&
        !(formato === 'compartilhamento' && DISPENSAVEIS_NO_COMPARTILHAMENTO.has(c)),
    );
    if (faltam.length) {
      throw new PlanilhaInvalidaError(`Faltam colunas na planilha: ${faltam.join(', ')}.`);
    }

    return {
      formato,
      linhas: linhas.flatMap((celulas, i) => {
        if (celulas.every(vazia)) return [];
        const registro: Record<string, Celula> = {};
        for (const [nome, indice] of colunas) registro[nome] = celulas[indice] ?? null;
        return [{ numero: i + 2, registro }];
      }),
    };
  }
}
