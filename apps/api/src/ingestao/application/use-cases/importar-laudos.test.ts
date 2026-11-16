import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it } from 'vitest';

import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import type { Celula } from '../../domain/celulas';
import type { CadastrosIngestao } from '../../domain/preparar-laudo';
import { AvisosEmMemoria, ImportacoesEmMemoria, LaudosEmMemoria } from '../../testing/fakes';
import {
  type FormatoPlanilha,
  type LeitorPlanilha,
  PlanilhaInvalidaError,
} from '../ports/leitor-planilha';
import { ImportarLaudos } from './importar-laudos';

const cadastros: CadastrosIngestao = {
  catalogo: {
    exames: new Map([
      [
        'tc torax',
        { id: 'ex-torax', modalidadeId: 'mod-ct', especialidadeId: 'esp-mi', categoriaId: null },
      ],
    ]),
    valoresForaDoPadrao: new Map(),
    quebras: new Map(),
    modalidades: new Map([['ct', 'mod-ct']]),
    especialidades: new Map(),
    especialidadesInvalidas: new Set(),
  },
  prioridades: new Map([['rotina', 'pri-rotina']]),
  resolverCliente: (empresa) => ({ 'CLINICA X': 'c-x', 'CLINICA Y': 'c-y' })[empresa] ?? null,
  resolverMedico: () => 'm-ana',
};

const registro = (codigo: string, campos: Record<string, Celula> = {}): Record<string, Celula> => ({
  EMPRESA: 'CLINICA X',
  NOME_PACIENTE: 'Paciente',
  CODIGO_PACIENTE: codigo,
  ESTUDO_DESCRICAO: 'TC TORAX',
  ACCESSION_NUMBER: `A${codigo}`,
  MODALIDADE: 'CT',
  PRIORIDADE: 'Rotina',
  VALORES: 1,
  ESPECIALIDADE: '',
  MEDICO: 'Dra. Ana',
  STATUS: 'Assinado',
  DATA_REALIZACAO: '05/10/2026',
  HORA_REALIZACAO: '08:00',
  DATA_LAUDO: '06/10/2026',
  HORA_LAUDO: '10:00',
  ...campos,
});

describe('ImportarLaudos', () => {
  let importacoes: ImportacoesEmMemoria;
  let laudos: LaudosEmMemoria;
  let avisos: AvisosEmMemoria;
  let planilha: { formato: FormatoPlanilha; registros: Record<string, Celula>[] } | Error;
  let bloqueadas: string[];
  let trava: { travaRemocaoMinimo: number; travaRemocaoFator: number };

  const armazenamento = {
    ler: async () => Readable.from([]),
  } as unknown as ArmazenamentoArquivos;
  const leitor: LeitorPlanilha = {
    ler: async () => {
      if (planilha instanceof Error) throw planilha;
      return {
        formato: planilha.formato,
        linhas: planilha.registros.map((r, i) => ({ numero: i + 2, registro: r })),
      };
    },
  };

  const importar = async (
    id: string,
    registros: Record<string, Celula>[],
    formato: FormatoPlanilha = 'laudos',
  ) => {
    planilha = { formato, registros };
    importacoes.criar(id);
    const casoDeUso = new ImportarLaudos(
      importacoes,
      armazenamento,
      leitor,
      { carregar: async () => cadastros },
      { listar: async () => bloqueadas },
      laudos,
      avisos,
      { obter: async () => ({ ...trava, retencaoLinhasBrutasDias: 90 }) },
      { pseudonimo: (t) => `hmac(${t})` },
      () => new Date('2026-10-07T12:00:00Z'),
    );
    await casoDeUso.executar(id);
    return importacoes.itens.get(id);
  };

  beforeEach(() => {
    importacoes = new ImportacoesEmMemoria();
    laudos = new LaudosEmMemoria();
    avisos = new AvisosEmMemoria();
    bloqueadas = [];
    trava = { travaRemocaoMinimo: 500, travaRemocaoFator: 2 };
  });

  it('importa os laudos e conclui com os contadores e a janela', async () => {
    const r = await importar('i1', [registro('1'), registro('2')]);

    expect(r?.status).toBe('concluida');
    expect(r?.resultado).toMatchObject({
      formato: 'laudos',
      janelaInicio: '2026-10-06',
      janelaFim: '2026-10-06',
      linhasArquivo: 2,
      inseridos: 2,
      atualizados: 0,
      inalterados: 0,
      removidos: 0,
      invalidas: 0,
      ignoradasCompetenciaFechada: 0,
    });
    expect(laudos.ativos()).toHaveLength(2);
    expect(laudos.linhasBrutas).toHaveLength(2);
  });

  it('reimportar o mesmo arquivo não muda nada', async () => {
    await importar('i1', [registro('1'), registro('2')]);
    const r = await importar('i2', [registro('1'), registro('2')]);

    expect(r?.resultado).toMatchObject({
      inseridos: 0,
      atualizados: 0,
      inalterados: 2,
      removidos: 0,
    });
    expect(laudos.linhasBrutas).toHaveLength(2);
  });

  it('o laudo que mudou é atualizado e o que sumiu da janela é removido', async () => {
    await importar('i1', [registro('1'), registro('2')]);
    const r = await importar('i2', [registro('1', { STATUS: 'Reassinado' })]);

    expect(r?.resultado).toMatchObject({ atualizados: 1, removidos: 1 });
    expect(laudos.ativos().map((l) => l.status)).toEqual(['Reassinado']);
  });

  it('linha inválida fica de fora com o motivo, e o resto entra', async () => {
    const r = await importar('i1', [registro('1'), registro('2', { DATA_LAUDO: '31/02/2026' })]);

    expect(r?.status).toBe('concluida');
    expect(r?.resultado).toMatchObject({
      inseridos: 1,
      invalidas: 1,
      errosLinhas: [{ linha: 3, mensagem: 'DATA_LAUDO: data inválida: "31/02/2026"' }],
    });
  });

  it('guarda só os 20 primeiros erros de linha', async () => {
    const ruins = Array.from({ length: 25 }, (_, i) => registro(String(i), { STATUS: '' }));
    const r = await importar('i1', [registro('ok'), ...ruins]);

    expect(r?.resultado?.invalidas).toBe(25);
    expect(r?.resultado?.errosLinhas).toHaveLength(20);
  });

  it('sem nenhuma linha válida, termina com erro', async () => {
    const r = await importar('i1', [registro('1', { EMPRESA: '' })]);

    expect(r?.status).toBe('erro');
    expect(r?.resultado?.mensagem).toBe('Nenhuma linha válida na planilha.');
  });

  it('planilha sem as colunas termina com erro e o motivo', async () => {
    planilha = new PlanilhaInvalidaError('Faltam colunas na planilha: VALORES.');
    importacoes.criar('i1');
    const casoDeUso = new ImportarLaudos(
      importacoes,
      armazenamento,
      leitor,
      { carregar: async () => cadastros },
      { listar: async () => [] },
      laudos,
      avisos,
      { obter: async () => ({ ...trava, retencaoLinhasBrutasDias: 90 }) },
      { pseudonimo: (t) => t },
      () => new Date(),
    );
    await casoDeUso.executar('i1');

    expect(importacoes.itens.get('i1')).toMatchObject({
      status: 'erro',
      resultado: { mensagem: 'Faltam colunas na planilha: VALORES.' },
    });
  });

  it('a trava recusa o arquivo que removeria demais, sem gravar nada', async () => {
    await importar('i1', [registro('1'), registro('2'), registro('3'), registro('4')]);
    trava = { travaRemocaoMinimo: 2, travaRemocaoFator: 2 };

    const r = await importar('i2', [registro('1')]);

    expect(r?.status).toBe('recusada');
    expect(r?.resultado?.mensagem).toContain('parece incompleto');
    expect(laudos.ativos()).toHaveLength(4);
  });

  it('linhas de competência bloqueada ficam de fora', async () => {
    bloqueadas = ['2026-10'];
    const r = await importar('i1', [
      registro('1'),
      registro('2', { DATA_REALIZACAO: '05/11/2026', DATA_LAUDO: '06/11/2026' }),
    ]);

    expect(r?.resultado).toMatchObject({ inseridos: 1, ignoradasCompetenciaFechada: 1 });
    expect(laudos.ativos().map((l) => l.competencia)).toEqual(['2026-11']);
  });

  it('importação que já terminou não roda de novo', async () => {
    await importar('i1', [registro('1')]);
    const antes = laudos.laudos.size;
    planilha = { formato: 'laudos', registros: [registro('9')] };

    await new ImportarLaudos(
      importacoes,
      armazenamento,
      leitor,
      { carregar: async () => cadastros },
      { listar: async () => [] },
      laudos,
      avisos,
      { obter: async () => ({ ...trava, retencaoLinhasBrutasDias: 90 }) },
      { pseudonimo: (t) => t },
      () => new Date(),
    ).executar('i1');

    expect(laudos.laudos.size).toBe(antes);
  });

  it('o compartilhamento só reconcilia as empresas do arquivo', async () => {
    await importar(
      'i1',
      [registro('1'), registro('2', { EMPRESA: 'CLINICA Y' })],
      'compartilhamento',
    );
    const r = await importar('i2', [registro('1')], 'compartilhamento');

    expect(r?.resultado).toMatchObject({ removidos: 0, inalterados: 1 });
    expect(laudos.ativos()).toHaveLength(2);
  });

  it('registra os avisos somando as ocorrências, e o que foi conferido', async () => {
    await importar('i1', [
      registro('1', { EMPRESA: 'Clinica Nova' }),
      registro('2', { EMPRESA: 'CLINICA NOVA' }),
      registro('3'),
    ]);

    const [chamada] = avisos.chamadas;
    expect(chamada?.pendencias).toContainEqual({
      tipo: 'cliente',
      chave: 'clinica nova',
      valor: 'CLINICA NOVA',
      ocorrencias: 2,
    });
    expect(chamada?.conferidos).toContainEqual({ tipo: 'cliente', chave: 'clinica x' });
  });
});
