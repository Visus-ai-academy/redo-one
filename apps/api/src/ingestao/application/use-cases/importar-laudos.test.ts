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
import { type RelatorioMobileMed, RelatorioMobileMedError } from '../ports/relatorio-mobilemed';
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

  const parametrosFake = {
    obter: async () => ({
      ...trava,
      retencaoLinhasBrutasDias: 90,
      mobilemedIntervaloMinutos: 30,
      mobilemedMesesAnteriores: 1,
      mobilemedJanelaDias: 7,
      mobilemedTeto: 50_000,
      mobilemedCompartilhamentoUnidades: ['CRD_APOIO'],
    }),
    salvar: async () => undefined,
  };
  const relatorio: RelatorioMobileMed & { pedidos: unknown[] } = {
    pedidos: [],
    async buscar(formato, periodo, fatiamento) {
      this.pedidos.push({ formato, periodo, fatiamento });
      if (planilha instanceof Error) throw planilha;
      return {
        formato,
        linhas: planilha.registros.map((r, i) => ({ numero: i + 1, registro: r })),
      };
    },
  };
  const novo = (pseudonimo: (t: string) => string = (t) => `hmac(${t})`) =>
    new ImportarLaudos(
      importacoes,
      armazenamento,
      leitor,
      { carregar: async () => cadastros },
      { listar: async () => bloqueadas },
      laudos,
      avisos,
      parametrosFake,
      { pseudonimo },
      relatorio,
      () => new Date('2026-10-07T12:00:00Z'),
    );

  const importar = async (
    id: string,
    registros: Record<string, Celula>[],
    formato: FormatoPlanilha = 'laudos',
  ) => {
    planilha = { formato, registros };
    importacoes.criar(id);
    await novo().executar(id);
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

  it('grava o nome e o código do paciente à parte, e reimportar igual não os regrava', async () => {
    await importar('i1', [registro('1'), registro('2', { NOME_PACIENTE: null })]);

    expect([...laudos.pacientes.values()].map(({ nome, codigo }) => ({ nome, codigo }))).toEqual([
      { nome: 'Paciente', codigo: '1' },
      { nome: null, codigo: '2' },
    ]);
    expect(laudos.gravacoesPaciente).toBe(2);

    await importar('i2', [registro('1'), registro('2', { NOME_PACIENTE: null })]);
    expect(laudos.gravacoesPaciente).toBe(2);
  });

  it('o laudo já gravado sem paciente ganha o nome na próxima importação, mesmo sem mudar', async () => {
    await importar('i1', [registro('1')]);
    // Como os laudos importados antes de o nome ser guardado.
    laudos.pacientes.clear();

    const r = await importar('i2', [registro('1')]);

    expect(r?.resultado).toMatchObject({ inseridos: 0, atualizados: 0, inalterados: 1 });
    expect([...laudos.pacientes.values()].map((p) => p.nome)).toEqual(['Paciente']);
  });

  it('o nome corrigido na MobileMed é regravado sem contar o laudo como atualizado', async () => {
    await importar('i1', [registro('1')]);
    const r = await importar('i2', [registro('1', { NOME_PACIENTE: 'Paciente Corrigido' })]);

    expect(r?.resultado).toMatchObject({ atualizados: 0, inalterados: 1 });
    expect([...laudos.pacientes.values()].map((p) => p.nome)).toEqual(['Paciente Corrigido']);
  });

  it('o laudo igual já gravado sem o id da conta MobileMed ganha o id, sem contar como atualizado', async () => {
    await importar('i1', [registro('1')]);
    const r = await importar('i2', [registro('1', { MEDICO_ID: 45, MEDICO_REASSINATURA_ID: 46 })]);

    expect(r?.resultado).toMatchObject({ inseridos: 0, atualizados: 0, inalterados: 1 });
    expect(laudos.ativos()).toMatchObject([
      { medicoIdMobilemed: 45, medicoReassinaturaIdMobilemed: 46 },
    ]);
    // A linha crua não é regravada.
    expect(laudos.linhasBrutas).toHaveLength(1);

    // O upload, que não traz o id, não apaga o que a API gravou.
    await importar('i3', [registro('1')]);
    expect(laudos.ativos()[0]?.medicoIdMobilemed).toBe(45);
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
    await novo((t) => t).executar('i1');

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

    await novo((t) => t).executar('i1');

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

  describe('pela MobileMed', () => {
    const periodo = { inicio: '2026-10-01', fim: '2026-10-07' };
    const importarMobileMed = async (
      registros: Record<string, Celula>[] | Error,
      formato: FormatoPlanilha = 'laudos',
    ) => {
      planilha = registros instanceof Error ? registros : { formato, registros };
      const [id = ''] =
        (await importacoes.criarMobileMed({
          formatos: [formato],
          periodo,
          enviadaPorId: null,
          agora: new Date(),
        })) ?? [];
      await novo().executar(id);
      return importacoes.itens.get(id);
    };

    it('busca o relatório do período com o fatiamento dos parâmetros e importa', async () => {
      const r = await importarMobileMed([registro('1'), registro('2')]);

      expect(relatorio.pedidos).toEqual([
        { formato: 'laudos', periodo, fatiamento: { janelaDias: 7, teto: 50_000 } },
      ]);
      expect(r?.status).toBe('concluida');
      expect(r?.resultado).toMatchObject({ inseridos: 2, linhasArquivo: 2 });
    });

    it('a janela é o período pedido: remove o laudo de um dia que não trouxe nada', async () => {
      await importar('i1', [
        registro('1'),
        registro('2', { DATA_LAUDO: '02/10/2026', DATA_REALIZACAO: '01/10/2026' }),
      ]);

      const r = await importarMobileMed([registro('1')]);

      expect(r?.resultado).toMatchObject({
        janelaInicio: '2026-10-01',
        janelaFim: '2026-10-07',
        inalterados: 1,
        removidos: 1,
      });
    });

    it('compartilhamento: só entram as unidades de destino configuradas', async () => {
      const r = await importarMobileMed(
        [registro('1', { EMPRESA: 'CRD_APOIO' }), registro('2', { EMPRESA: 'OUTRA UNIDADE' })],
        'compartilhamento',
      );

      expect(r?.resultado).toMatchObject({ linhasArquivo: 1, inseridos: 1 });
      expect(laudos.ativos().map((l) => l.empresaOrigem)).toEqual(['CRD_APOIO']);
    });

    it('falha da MobileMed termina com erro e a mensagem, sem mexer nos laudos', async () => {
      await importar('i1', [registro('1')]);

      const r = await importarMobileMed(
        new RelatorioMobileMedError('MobileMed: o relatório respondeu HTTP 503.'),
      );

      expect(r).toMatchObject({
        status: 'erro',
        resultado: { mensagem: 'MobileMed: o relatório respondeu HTTP 503.' },
      });
      expect(laudos.ativos()).toHaveLength(1);
    });

    it('sem nenhum laudo no período, termina com erro e não remove nada', async () => {
      await importar('i1', [registro('1')]);

      const r = await importarMobileMed([]);

      expect(r).toMatchObject({
        status: 'erro',
        resultado: {
          mensagem: 'A MobileMed não trouxe nenhum laudo no período. Nada foi removido.',
        },
      });
      expect(laudos.ativos()).toHaveLength(1);
    });
  });
});
