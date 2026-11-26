import { beforeEach, describe, expect, it } from 'vitest';

import type { Tipificador } from '../../../faturamento/domain/tipificacao';
import { CompetenciasEmMemoria, CortesEmMemoria } from '../../../faturamento/testing/fakes';
import type { Celula } from '../../domain/celulas';
import type { CadastrosIngestao } from '../../domain/preparar-laudo';
import { AvisosEmMemoria, ImportacoesEmMemoria, LaudosEmMemoria } from '../../testing/fakes';
import { CarregarLaudosLegado } from './carregar-laudos-legado';

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
  resolverCliente: (empresa) =>
    ({ 'CLINICA X': 'c-x', CRD_APOIO: 'c-crd', OUTRA_UNIDADE: 'c-outra' })[empresa] ?? null,
  resolverUnidade: () => null,
  resolverMedico: () => 'm-ana',
};

/** Laudo de 10/09 (competência 2026-09, com o corte padrão). */
const registro = (codigo: string, campos: Record<string, Celula> = {}): Record<string, Celula> => ({
  EMPRESA: 'CLINICA X',
  NOME_PACIENTE: 'Paciente',
  CODIGO_PACIENTE: codigo,
  ESTUDO_DESCRICAO: 'TC TORAX',
  ACCESSION_NUMBER: `A${codigo}`,
  MODALIDADE: 'CT',
  PRIORIDADE: 'Rotina',
  VALORES: '1.00',
  ESPECIALIDADE: 'MEDICINA INTERNA',
  MEDICO: 'Dra. Ana',
  STATUS: 'Assinado',
  DATA_REALIZACAO: '09/09/2026',
  HORA_REALIZACAO: '08:00:00',
  DATA_LAUDO: '10/09/2026',
  HORA_LAUDO: '10:00:00',
  ...campos,
});
/** Laudo de outubro (competência 2026-10). */
const deOutubro = (codigo: string) =>
  registro(codigo, { DATA_REALIZACAO: '14/10/2026', DATA_LAUDO: '15/10/2026' });
const compartilhado = (codigo: string, empresa: string) =>
  registro(codigo, {
    EMPRESA: empresa,
    COMPARTILHAMENTO_ENVIADO_PARA: 'TELEIMAGEM',
    UNIDADE_ORIGEM: 'HOSPITAL',
  });

describe('CarregarLaudosLegado', () => {
  let importacoes: ImportacoesEmMemoria;
  let laudos: LaudosEmMemoria;
  let avisos: AvisosEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let tipificar: Tipificador | null;

  const novo = () =>
    new CarregarLaudosLegado(
      importacoes,
      { carregar: async () => cadastros },
      competencias,
      new CortesEmMemoria(),
      { carregar: async () => tipificar },
      laudos,
      avisos,
      {
        obter: async () => ({
          travaRemocaoMinimo: 500,
          travaRemocaoFator: 2,
          retencaoLinhasBrutasDias: 90,
          mobilemedIntervaloMinutos: 30,
          mobilemedMesesAnteriores: 1,
          mobilemedJanelaDias: 7,
          mobilemedTeto: 50_000,
          mobilemedCompartilhamentoUnidades: ['CRD_APOIO'],
        }),
        salvar: async () => undefined,
      },
      { pseudonimo: (t) => `hmac(${t})` },
      () => new Date('2026-11-26T12:00:00Z'),
    );
  const carregar = (registros: Record<string, Celula>[], gravar = true) =>
    novo().executar({
      linhas: registros.map((registro, i) => ({ numero: i + 1, registro })),
      competencias: ['2026-09'],
      janela: { inicio: '2026-09-01', fim: '2026-10-31' },
      gravar,
    });

  beforeEach(() => {
    importacoes = new ImportacoesEmMemoria();
    laudos = new LaudosEmMemoria();
    avisos = new AvisosEmMemoria();
    competencias = new CompetenciasEmMemoria();
    tipificar = null;
  });

  it('insere pelo caminho da importação só os laudos das competências pedidas, registrando a carga', async () => {
    const r = await carregar([registro('1'), registro('2'), deOutubro('3'), { EMPRESA: 'X' }]);

    expect(laudos.ativos().map((l) => [l.competencia, l.volume, l.clienteId])).toEqual([
      ['2026-09', 1, 'c-x'],
      ['2026-09', 1, 'c-x'],
    ]);
    expect(laudos.pacientes.size).toBe(2);
    expect(r).toMatchObject({
      linhas: 4,
      invalidas: 1,
      foraDasCompetencias: 1,
      jaGravados: 0,
      inseridos: 2,
      porCompetencia: { '2026-09': { inseridos: 2, jaGravados: 0 } },
    });
    expect([...competencias.competencias.keys()]).toEqual(['2026-09']);
    const [carga] = [...importacoes.cargas.values()];
    expect(carga).toMatchObject({
      janela: { inicio: '2026-09-01', fim: '2026-10-31' },
      status: 'concluida',
      resultado: { formato: 'laudos', linhasArquivo: 4, inseridos: 2, inalterados: 0 },
    });
    expect(laudos.ativos().every((l) => l.importacaoId === r.importacaoId)).toBe(true);
    expect(avisos.chamadas).toHaveLength(1);
  });

  it('o laudo que já está gravado fica como está, mesmo com outro conteúdo, e a carga é idempotente', async () => {
    await carregar([registro('1')]);
    const antes = structuredClone([...laudos.laudos.values()]);

    const r = await carregar([registro('1', { STATUS: 'Revisado' }), registro('2')]);

    expect(r).toMatchObject({ jaGravados: 1, inseridos: 1 });
    expect(laudos.laudos.get(antes[0]?.identidade ?? '')).toEqual(antes[0]);
    expect(await carregar([registro('1'), registro('2')])).toMatchObject({
      jaGravados: 2,
      inseridos: 0,
    });
  });

  it('grava na competência fechada pedida, sem mexer na trava dela', async () => {
    competencias.competencias.set('2026-09', { status: 'fechada', importacaoTravada: false });

    const r = await carregar([registro('1')]);

    expect(r.inseridos).toBe(1);
    expect(competencias.competencias.get('2026-09')).toEqual({
      status: 'fechada',
      importacaoTravada: false,
    });
  });

  it('tipifica os laudos inseridos', async () => {
    tipificar = (l) => ({ regraId: 'CO', subregraId: null, fatura: l.clienteId === 'c-x' });

    await carregar([registro('1')]);

    expect([...laudos.classificacoes.values()]).toEqual([
      { regraId: 'CO', subregraId: null, fatura: true },
    ]);
  });

  it('a linha de compartilhamento vira laudo de compartilhamento, só das unidades aceitas', async () => {
    const r = await carregar([
      compartilhado('1', 'CRD_APOIO'),
      compartilhado('2', 'OUTRA_UNIDADE'),
    ]);

    expect(laudos.ativos().map((l) => [l.origem, l.empresaOrigem])).toEqual([
      ['compartilhamento', 'CRD_APOIO'],
    ]);
    expect(r).toMatchObject({ linhas: 2, unidadesRecusadas: 1, inseridos: 1 });
  });

  it('sem gravar, só conta: nada entra e nenhuma carga é registrada', async () => {
    const r = await carregar([registro('1'), deOutubro('2')], false);

    expect(r).toMatchObject({ inseridos: 0, novos: 1, foraDasCompetencias: 1, importacaoId: null });
    expect(laudos.laudos.size).toBe(0);
    expect(importacoes.cargas.size).toBe(0);
    expect(competencias.competencias.size).toBe(0);
  });
});
