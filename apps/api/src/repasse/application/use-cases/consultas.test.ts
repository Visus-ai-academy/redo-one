import { describe, expect, it } from 'vitest';

import {
  type CompetenciaLida,
  type ConsultasRepasse,
  type DemonstrativoLido,
  type FiltroDemonstrativos,
  type GeracaoLida,
  TOTAIS_ZERADOS,
} from '../ports/consultas-repasse';
import {
  DemonstrativoNaoEncontradoError,
  ListarDemonstrativos,
  ListarLaudosDoDemonstrativo,
  ObterCompetenciaRepasse,
  ObterDemonstrativo,
  TarifasDoLancamento,
  VersaoNaoEncontradaError,
} from './consultas';

const geracao = (id: string, atual: boolean, extra: Partial<GeracaoLida> = {}): GeracaoLida => ({
  id,
  tipo: 'previa',
  atual,
  geradoEm: new Date('2026-11-01T00:00:00Z'),
  recalculo: null,
  totais: TOTAIS_ZERADOS,
  ...extra,
});

const COMPETENCIA: CompetenciaLida = {
  competencia: '2026-11',
  status: 'fechada',
  fechadaEm: new Date('2026-12-05T12:00:00Z'),
  fechadaPor: 'Ana Lima',
  reabertaEm: null,
  geracoes: [
    geracao('g1', false),
    geracao('g2', true, {
      tipo: 'recalculo',
      recalculo: { motivo: 'valor errado', solicitadoPor: 'Bruno', solicitadoEm: new Date() },
    }),
  ],
  recalculoPendente: null,
};

const DEMONSTRATIVO = {
  id: 'd1',
  geracaoId: 'g2',
  competencia: '2026-11',
  medicoId: 'm1',
  medico: 'Ana',
} as DemonstrativoLido;

function montar() {
  const filtros: FiltroDemonstrativos[] = [];
  const consultas: ConsultasRepasse = {
    competencias: async () => [],
    competencia: async (c) =>
      c === '2026-11'
        ? COMPETENCIA
        : {
            competencia: c,
            status: 'aberta',
            fechadaEm: null,
            fechadaPor: null,
            reabertaEm: null,
            geracoes: [],
            recalculoPendente: null,
          },
    demonstrativos: async (f) => {
      filtros.push(f);
      return {
        itens: [],
        total: 0,
        pagina: f.pagina,
        porPagina: f.porPagina,
        totais: TOTAIS_ZERADOS,
      };
    },
    demonstrativo: async (id) => (id === 'd1' ? DEMONSTRATIVO : null),
    medicos: async () => [],
    laudos: async (_id, pagina, porPagina) => ({
      itens: [
        {
          laudoId: 'l1',
          peca: 0,
          dataLaudo: new Date(),
          exame: 'TC CRANIO',
          cliente: 'CEDIM',
          volume: 1,
          totalCentavos: 3207,
        },
        {
          laudoId: 'l2',
          peca: 0,
          dataLaudo: new Date(),
          exame: null,
          cliente: null,
          volume: 1,
          totalCentavos: 0,
        },
      ],
      total: 2,
      pagina,
      porPagina,
    }),
  };
  return { consultas, filtros };
}

const FILTRO = {
  situacao: 'todas' as const,
  ordem: 'medico' as const,
  direcao: 'asc' as const,
  pagina: 1,
  porPagina: 25,
};

describe('ObterCompetenciaRepasse', () => {
  it('numera as versões pela ordem em que foram geradas e aponta a atual', async () => {
    const r = await new ObterCompetenciaRepasse(montar().consultas).executar('2026-11');
    expect(r.versoes.map((v) => [v.numero, v.id, v.atual])).toEqual([
      [1, 'g1', false],
      [2, 'g2', true],
    ]);
    expect(r.atual?.numero).toBe(2);
    expect(r.atual?.recalculo?.motivo).toBe('valor errado');
  });

  it('competência sem repasse gerado: aberta e sem versão (não é erro)', async () => {
    const r = await new ObterCompetenciaRepasse(montar().consultas).executar('2027-01');
    expect(r).toMatchObject({ status: 'aberta', versoes: [], atual: null });
  });
});

describe('ListarDemonstrativos', () => {
  it('sem versão escolhida, lê a atual', async () => {
    const { consultas, filtros } = montar();
    await new ListarDemonstrativos(consultas).executar('2026-11', { ...FILTRO });
    expect(filtros[0]?.geracaoId).toBe('g2');
  });

  it('lê a versão escolhida, se for da competência', async () => {
    const { consultas, filtros } = montar();
    await new ListarDemonstrativos(consultas).executar('2026-11', { ...FILTRO, versao: 'g1' });
    expect(filtros[0]?.geracaoId).toBe('g1');
  });

  it('versão de outra competência é 404', async () => {
    await expect(
      new ListarDemonstrativos(montar().consultas).executar('2026-11', {
        ...FILTRO,
        versao: 'outra',
      }),
    ).rejects.toBeInstanceOf(VersaoNaoEncontradaError);
  });

  it('competência sem repasse gerado: página vazia com os totais zerados', async () => {
    const { consultas, filtros } = montar();
    const r = await new ListarDemonstrativos(consultas).executar('2027-01', { ...FILTRO });
    expect(r).toEqual({ itens: [], total: 0, pagina: 1, porPagina: 25, totais: TOTAIS_ZERADOS });
    expect(filtros).toHaveLength(0);
  });
});

describe('ObterDemonstrativo', () => {
  it('traz o número da versão da geração do demonstrativo', async () => {
    const r = await new ObterDemonstrativo(montar().consultas).executar('d1');
    expect(r).toMatchObject({ id: 'd1', versao: 2, versaoAtual: true });
  });

  it('inexistente é 404', async () => {
    await expect(new ObterDemonstrativo(montar().consultas).executar('x')).rejects.toBeInstanceOf(
      DemonstrativoNaoEncontradoError,
    );
  });
});

describe('ListarLaudosDoDemonstrativo', () => {
  it('com a permissão, cada laudo vem com o nome do paciente (pela leitura auditada)', async () => {
    const lidos: string[][] = [];
    const caso = new ListarLaudosDoDemonstrativo(montar().consultas, {
      executar: async (_leitor, ids) => {
        lidos.push(ids);
        return new Map([['l1', { nome: 'MARIA SOUZA', codigo: '001' }]]);
      },
    });
    const r = await caso.executar({ usuarioId: 'u', podeVerPaciente: true }, 'd1', 1, 10);
    expect(lidos).toEqual([['l1', 'l2']]);
    expect(r.itens.map((l) => l.paciente)).toEqual(['MARIA SOUZA', null]);
    expect(r.pacienteVisivel).toBe(true);
  });

  it('sem a permissão, não lê o paciente', async () => {
    let leu = false;
    const caso = new ListarLaudosDoDemonstrativo(montar().consultas, {
      executar: async () => {
        leu = true;
        return new Map();
      },
    });
    const r = await caso.executar({ usuarioId: 'u', podeVerPaciente: false }, 'd1', 1, 10);
    expect(leu).toBe(false);
    expect(r.itens.every((l) => l.paciente === null)).toBe(true);
    expect(r.pacienteVisivel).toBe(false);
  });

  it('demonstrativo inexistente é 404', async () => {
    const caso = new ListarLaudosDoDemonstrativo(montar().consultas, {
      executar: async () => new Map(),
    });
    await expect(
      caso.executar({ usuarioId: 'u', podeVerPaciente: true }, 'x', 1, 10),
    ).rejects.toBeInstanceOf(DemonstrativoNaoEncontradoError);
  });
});

describe('TarifasDoLancamento', () => {
  const tarifas = async (c: string) =>
    c >= '2026-12'
      ? { peerReviewCentavos: 2500, plantaoCentavos: 60000 }
      : { peerReviewCentavos: 2100, plantaoCentavos: 35000 };

  it('na aberta, a tarifa vigente nela', async () => {
    const caso = new TarifasDoLancamento({ fechadas: async () => ['2026-10'] }, { tarifas });
    expect(await caso.executar('2026-11')).toEqual({
      competencia: '2026-11',
      fechada: false,
      destino: '2026-11',
      tarifasDestino: { peerReviewCentavos: 2100, plantaoCentavos: 35000 },
      tarifasDaCompetencia: { peerReviewCentavos: 2100, plantaoCentavos: 35000 },
    });
  });

  it('na fechada, diz a próxima aberta e as tarifas de lá e da própria fechada', async () => {
    const caso = new TarifasDoLancamento(
      { fechadas: async () => ['2026-10', '2026-11'] },
      { tarifas },
    );
    expect(await caso.executar('2026-11')).toMatchObject({
      fechada: true,
      destino: '2026-12',
      tarifasDestino: { plantaoCentavos: 60000 },
      tarifasDaCompetencia: { plantaoCentavos: 35000 },
    });
  });
});
