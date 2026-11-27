import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it } from 'vitest';

import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import type { Tipificador } from '../../../faturamento/domain/tipificacao';
import { CompetenciasEmMemoria, CortesEmMemoria } from '../../../faturamento/testing/fakes';
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
  resolverUnidade: () => null,
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
  let competencias: CompetenciasEmMemoria;
  let cortes: CortesEmMemoria;
  let trava: { travaRemocaoMinimo: number; travaRemocaoFator: number };
  /** Tipifica pela especialidade (o mecanismo de verdade é testado no `faturamento`). */
  let tipificar: Tipificador | null;

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
  const novo = (
    pseudonimo: (t: string) => string = (t) => `hmac(${t})`,
    cadastrosDaImportacao: CadastrosIngestao = cadastros,
  ) =>
    new ImportarLaudos(
      importacoes,
      armazenamento,
      leitor,
      { carregar: async () => cadastrosDaImportacao },
      competencias,
      cortes,
      { carregar: async () => tipificar },
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
    competencias = new CompetenciasEmMemoria();
    cortes = new CortesEmMemoria();
    trava = { travaRemocaoMinimo: 500, travaRemocaoFator: 2 };
    tipificar = null;
  });

  it('tipifica todos os laudos da janela, inclusive os que não mudaram', async () => {
    tipificar = (l) => ({ regraId: 'CO', subregraId: null, fatura: l.clienteId === 'c-x' });
    await importar('i1', [registro('1'), registro('2', { EMPRESA: 'CLINICA Y' })]);
    expect([...laudos.classificacoes.values()].map((c) => c.fatura)).toEqual([true, false]);

    // Configuração nova: reimportar o mesmo arquivo não muda os laudos, mas a tipificação sim.
    tipificar = (l) => ({ regraId: 'NC', subregraId: 'NC-NF', fatura: l.clienteId !== 'c-x' });
    const r = await importar('i2', [registro('1'), registro('2', { EMPRESA: 'CLINICA Y' })]);
    expect(r?.resultado).toMatchObject({ inalterados: 2 });
    expect([...laudos.classificacoes.values()]).toEqual([
      { regraId: 'NC', subregraId: 'NC-NF', fatura: false },
      { regraId: 'NC', subregraId: 'NC-NF', fatura: true },
    ]);
  });

  it('sem regras de tipificação cadastradas, os laudos entram sem tipificação', async () => {
    await importar('i1', [registro('1')]);
    expect(laudos.ativos()).toHaveLength(1);
    expect(laudos.classificacoes.size).toBe(0);
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
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    const r = await importar('i1', [
      registro('1'),
      registro('2', { DATA_REALIZACAO: '05/11/2026', DATA_LAUDO: '06/11/2026' }),
    ]);

    expect(r?.resultado).toMatchObject({ inseridos: 1, ignoradasCompetenciaFechada: 1 });
    expect(laudos.ativos().map((l) => l.competencia)).toEqual(['2026-11']);
  });

  it('com todas as linhas de competência bloqueada, conclui sem mexer nos laudos', async () => {
    await importar('i1', [registro('1')]);
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });

    const r = await importar('i2', [registro('1'), registro('2')]);

    expect(r?.status).toBe('concluida');
    expect(r?.resultado).toMatchObject({
      linhasArquivo: 2,
      invalidas: 0,
      ignoradasCompetenciaFechada: 2,
      inseridos: 0,
      atualizados: 0,
      inalterados: 0,
      removidos: 0,
    });
    expect(r?.resultado?.mensagem).toBeUndefined();
    expect(laudos.ativos()).toHaveLength(1);
  });

  it('o corte do cliente decide a competência do laudo', async () => {
    cortes.porCliente.set('c-x', [
      { desde: '2026-11', corte: { dia: 25, mes: 'proprio', consideraExame: false } },
    ]);
    await importar('i1', [
      registro('1', { DATA_REALIZACAO: '20/11/2026', DATA_LAUDO: '27/11/2026' }),
      registro('2', {
        EMPRESA: 'CLINICA Y',
        DATA_REALIZACAO: '20/11/2026',
        DATA_LAUDO: '27/11/2026',
      }),
    ]);

    const porCliente = new Map(laudos.ativos().map((l) => [l.clienteId, l.competencia]));
    expect(porCliente.get('c-x')).toBe('2026-12');
    expect(porCliente.get('c-y')).toBe('2026-11');
  });

  it('o cliente resolvido depois da importação leva o laudo ao corte dele na reimportação', async () => {
    cortes.porCliente.set('c-novo', [
      { desde: '2026-10', corte: { dia: 5, mes: 'proprio', consideraExame: false } },
    ]);
    const linha = registro('1', { EMPRESA: 'CLINICA NOVA' });
    await importar('i1', [linha]);
    expect(laudos.ativos().map((l) => [l.clienteId, l.competencia])).toEqual([[null, '2026-10']]);

    // O apelido cadastrado resolve o cliente: o laudo muda de cliente na próxima importação.
    planilha = { formato: 'laudos', registros: [linha] };
    importacoes.criar('i2');
    await novo(undefined, {
      ...cadastros,
      resolverCliente: (empresa) => (empresa === 'CLINICA NOVA' ? 'c-novo' : null),
    }).executar('i2');

    expect(importacoes.itens.get('i2')?.resultado).toMatchObject({ atualizados: 1 });
    expect(laudos.ativos().map((l) => [l.clienteId, l.competencia])).toEqual([
      ['c-novo', '2026-11'],
    ]);
  });

  describe('laudo gravado quando o cálculo da competência diverge', () => {
    // O apelido triado passa a resolver a CLINICA NOVA para o c-novo; o resto continua igual.
    const comApelido: CadastrosIngestao['resolverCliente'] = (e) =>
      e === 'CLINICA NOVA' ? 'c-novo' : cadastros.resolverCliente(e);
    const reimportar = async (id: string, ...registros: Record<string, Celula>[]) => {
      planilha = { formato: 'laudos', registros };
      importacoes.criar(id);
      await novo(undefined, {
        ...cadastros,
        resolverCliente: comApelido,
      }).executar(id);
      return importacoes.itens.get(id);
    };

    it('o laudo de competência fechada não sai dela, mesmo que o novo cálculo dê um mês aberto', async () => {
      // Até o dia 25 no próprio mês: o laudo de 27/10 do c-novo cai em 2026-11.
      cortes.porCliente.set('c-novo', [
        { desde: '2026-10', corte: { dia: 25, mes: 'proprio', consideraExame: false } },
      ]);
      const linha = registro('1', {
        EMPRESA: 'CLINICA NOVA',
        DATA_REALIZACAO: '27/10/2026',
        DATA_LAUDO: '27/10/2026',
      });
      await importar('i1', [linha]);
      expect(laudos.ativos().map((l) => [l.clienteId, l.competencia])).toEqual([[null, '2026-10']]);
      const antes = structuredClone(laudos.laudos.get(laudos.ativos()[0]?.identidade ?? ''));
      competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });

      const r = await reimportar('i2', linha);

      expect(r?.resultado).toMatchObject({
        inseridos: 0,
        atualizados: 0,
        removidos: 0,
        ignoradasCompetenciaFechada: 1,
      });
      expect(laudos.ativos().map((l) => [l.clienteId, l.competencia])).toEqual([[null, '2026-10']]);
      expect(laudos.laudos.get(antes?.identidade ?? '')).toEqual(antes);
      expect(competencias.competencias.has('2026-11')).toBe(false);
    });

    it('o laudo de competência aberta não é removido quando o novo cálculo dá uma bloqueada', async () => {
      // Até o dia 7 do mês seguinte, sem olhar o exame: o laudo de 03/11 do c-novo cai em 2026-10.
      cortes.porCliente.set('c-novo', [
        { desde: '2026-10', corte: { dia: 7, mes: 'seguinte', consideraExame: false } },
      ]);
      const linha = registro('1', {
        EMPRESA: 'CLINICA NOVA',
        DATA_REALIZACAO: '03/11/2026',
        DATA_LAUDO: '03/11/2026',
      });
      // Outro laudo do mesmo dia, que segue em 2026-11: a janela da planilha cobre o 03/11.
      const novembro = registro('2', { DATA_REALIZACAO: '01/11/2026', DATA_LAUDO: '03/11/2026' });
      await importar('i1', [linha, novembro]);
      expect(laudos.ativos().map((l) => l.competencia)).toEqual(['2026-11', '2026-11']);
      const identidade =
        laudos.ativos().find((l) => l.empresaOrigem === 'CLINICA NOVA')?.identidade ?? '';
      const antes = structuredClone(laudos.laudos.get(identidade));
      competencias.competencias.set('2026-10', { status: 'aberta', importacaoTravada: true });

      const r = await reimportar('i2', linha, novembro);

      expect(r?.resultado).toMatchObject({
        inalterados: 1,
        removidos: 0,
        ignoradasCompetenciaFechada: 1,
      });
      expect(laudos.laudos.get(identidade)).toEqual(antes);
    });

    it('o laudo de competência bloqueada fora do arquivo não é removido', async () => {
      // Os dois laudados em 06/11: o de exame de 25/10 fica em 2026-10, o de 05/11 em 2026-11.
      const outubro = registro('1', { DATA_REALIZACAO: '25/10/2026', DATA_LAUDO: '06/11/2026' });
      const novembro = registro('2', { DATA_REALIZACAO: '05/11/2026', DATA_LAUDO: '06/11/2026' });
      await importar('i1', [outubro, novembro]);
      expect(laudos.ativos().map((l) => l.competencia)).toEqual(['2026-10', '2026-11']);
      competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });

      const r = await importar('i2', [novembro]);

      expect(r?.resultado).toMatchObject({
        inalterados: 1,
        removidos: 0,
        ignoradasCompetenciaFechada: 0,
      });
      expect(laudos.ativos()).toHaveLength(2);
    });
  });

  it('cria a linha da competência antes de gravar os laudos (se a gravação cair, ela existe)', async () => {
    laudos.aplicar = async () => {
      throw new Error('caiu ao gravar');
    };
    planilha = { formato: 'laudos', registros: [registro('1')] };
    importacoes.criar('i1');

    await expect(novo().executar('i1')).rejects.toThrow('caiu ao gravar');

    expect(competencias.competencias.get('2026-10')).toEqual({
      status: 'aberta',
      importacaoTravada: false,
    });
  });

  it('cria as competências dos laudos gravados, sem as das linhas ignoradas', async () => {
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    await importar('i1', [
      registro('1'),
      registro('2', { DATA_REALIZACAO: '05/11/2026', DATA_LAUDO: '06/11/2026' }),
    ]);

    expect([...competencias.competencias.keys()].sort()).toEqual(['2026-10', '2026-11']);
    expect(competencias.competencias.get('2026-10')?.status).toBe('fechada');
    expect(competencias.competencias.get('2026-11')).toEqual({
      status: 'aberta',
      importacaoTravada: false,
    });
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
      competencias: { desde: '2026-10', ate: '2026-10' },
    });
    expect(chamada?.conferidos).toContainEqual({ tipo: 'cliente', chave: 'clinica x' });
  });

  it('liga o aviso às competências dos laudos em que apareceu (da menor à maior)', async () => {
    await importar('i1', [
      registro('1', {
        EMPRESA: 'Clinica Nova',
        DATA_REALIZACAO: '05/09/2026',
        DATA_LAUDO: '06/09/2026',
      }),
      registro('2', { EMPRESA: 'Clinica Nova' }),
    ]);

    expect(avisos.chamadas[0]?.pendencias).toContainEqual(
      expect.objectContaining({
        tipo: 'cliente',
        ocorrencias: 2,
        competencias: { desde: '2026-09', ate: '2026-10' },
      }),
    );
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

    it('compartilhamento só de competência fechada conclui, sem erro', async () => {
      competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });

      const r = await importarMobileMed(
        [registro('1', { EMPRESA: 'CRD_APOIO' }), registro('2', { EMPRESA: 'CRD_APOIO' })],
        'compartilhamento',
      );

      expect(r?.status).toBe('concluida');
      expect(r?.resultado).toMatchObject({
        linhasArquivo: 2,
        ignoradasCompetenciaFechada: 2,
        inseridos: 0,
        removidos: 0,
        janelaInicio: '2026-10-01',
        janelaFim: '2026-10-07',
      });
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
