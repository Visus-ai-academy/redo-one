import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';

import { PlanilhaInvalidaError } from '../../application/ports/leitor-planilha';
import { XlsxLeitorPlanilha } from './xlsx-leitor-planilha';

const COLUNAS = [
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

async function planilha(cabecalho: string[], linhas: (string | number | Date | null)[][]) {
  const dados = [
    cabecalho.map((value) => ({ value })),
    ...linhas.map((l) =>
      l.map((value) =>
        value instanceof Date
          ? { type: Date, value, format: 'dd/mm/yyyy' }
          : value === null
            ? null
            : { value },
      ),
    ),
  ];
  return Readable.from(await writeXlsxFile(dados as never).toBuffer());
}

const leitor = new XlsxLeitorPlanilha();

describe('XlsxLeitorPlanilha', () => {
  it('lê a primeira aba com o cabeçalho da linha 1, em maiúsculas', async () => {
    const cabecalho = COLUNAS.map((c) => (c === 'EMPRESA' ? ' empresa ' : c));
    const linha = COLUNAS.map((c) =>
      c === 'EMPRESA' ? 'CLINICA X' : c === 'DATA_LAUDO' ? new Date('2026-10-06T00:00:00Z') : null,
    );

    const lida = await leitor.ler(await planilha([...cabecalho, 'DIGITADOR'], [linha]));

    expect(lida.formato).toBe('laudos');
    expect(lida.linhas).toHaveLength(1);
    expect(lida.linhas[0]?.numero).toBe(2);
    expect(lida.linhas[0]?.registro.EMPRESA).toBe('CLINICA X');
    expect(lida.linhas[0]?.registro.DATA_LAUDO).toEqual(new Date('2026-10-06T00:00:00Z'));
  });

  it('a planilha de compartilhamento traz COMPARTILHAMENTO_ENVIADO_PARA no lugar de EMPRESA', async () => {
    const cabecalho = COLUNAS.filter((c) => c !== 'ESPECIALIDADE').map((c) =>
      c === 'EMPRESA' ? 'COMPARTILHAMENTO_ENVIADO_PARA' : c === 'COMPLEMENTAR' ? 'COMPLEMENTO' : c,
    );
    const linha = cabecalho.map((c) => (c === 'COMPARTILHAMENTO_ENVIADO_PARA' ? 'CLINICA Y' : 'x'));

    const lida = await leitor.ler(await planilha([...cabecalho, 'UNIDADE_ORIGEM'], [linha]));

    expect(lida.formato).toBe('compartilhamento');
    expect(lida.linhas[0]?.registro.EMPRESA).toBe('CLINICA Y');
    expect(lida.linhas[0]?.registro.COMPLEMENTAR).toBe('x');
  });

  it('recusa a planilha sem as colunas que a importação usa, dizendo quais', async () => {
    const cabecalho = COLUNAS.filter((c) => c !== 'VALORES' && c !== 'DATA_LAUDO');

    await expect(leitor.ler(await planilha(cabecalho, []))).rejects.toThrow(
      new PlanilhaInvalidaError('Faltam colunas na planilha: VALORES, DATA_LAUDO.'),
    );
  });

  it('pula linhas vazias', async () => {
    const vazia = COLUNAS.map(() => null);
    const cheia = COLUNAS.map((c) => (c === 'EMPRESA' ? 'CLINICA X' : 'y'));

    const lida = await leitor.ler(await planilha(COLUNAS, [cheia, vazia, cheia]));

    expect(lida.linhas.map((l) => l.numero)).toEqual([2, 4]);
  });
});
