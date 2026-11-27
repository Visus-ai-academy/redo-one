import { describe, expect, it } from 'vitest';

import { PeerReviewJaPagoError } from '../../domain/adicional';
import type { AdicionaisRepository, AdicionalGravado } from '../ports/adicionais.repository';
import {
  AdicionalCanceladoError,
  CancelarAdicional,
  CancelarNaFechadaError,
  LancarAdicional,
  LancarNaFechadaSemPermissaoError,
  ListarAdicionais,
  MedicoNaoEncontradoError,
} from './adicionais';

const AGORA = new Date('2026-11-26T15:00:00Z');

function montar(fechadas: string[] = ['2026-09', '2026-10']) {
  const linhas = new Map<string, AdicionalGravado>();
  const previas: string[] = [];
  const recalculos: { competencia: string; motivo: string }[] = [];
  const filtros: Parameters<AdicionaisRepository['listar']>[0][] = [];
  const repo: AdicionaisRepository = {
    medicoExiste: async (id) => id === 'ana',
    tarifas: async () => ({ peerReviewCentavos: 2100, plantaoCentavos: 35000 }),
    peerReviewSobreposto: async (_m, desde, ate) =>
      [...linhas.values()].find(
        (a) =>
          a.tipo === 'peer_review' &&
          !a.canceladoEm &&
          (a.referenciaDesde ?? '') <= ate &&
          (a.referenciaAte ?? '') >= desde,
      ) as never,
    inserir: async (a) => {
      const id = `a${linhas.size + 1}`;
      linhas.set(id, {
        ...a,
        id,
        medico: 'Ana',
        recalculoId: null,
        lancadoPor: null,
        canceladoEm: null,
        canceladoPor: null,
        motivoCancelamento: null,
      });
      return id;
    },
    ligarRecalculo: async (id, recalculoId) => {
      const a = linhas.get(id);
      if (a) a.recalculoId = recalculoId;
    },
    obter: async (id) => linhas.get(id) ?? null,
    cancelar: async (id, _por, em, motivo) => {
      const a = linhas.get(id);
      if (a) Object.assign(a, { canceladoEm: em, motivoCancelamento: motivo });
    },
    listar: async (f) => {
      filtros.push(f);
      return {
        itens: [...linhas.values()],
        total: linhas.size,
        pagina: f.pagina,
        porPagina: f.porPagina,
      };
    },
  };
  const deps = {
    repo,
    competencias: { fechadas: async () => fechadas },
    recalculo: {
      solicitar: async (_u: string, competencia: string, motivo: string) => {
        recalculos.push({ competencia, motivo });
        return 'rc1';
      },
      obter: async () => null,
      concluir: async () => undefined,
    },
    agendador: {
      previa: async (c: string) => void previas.push(c),
      previas: async () => undefined,
    },
  };
  const lancar = new LancarAdicional(
    deps.repo,
    deps.competencias,
    deps.recalculo,
    deps.agendador,
    () => AGORA,
  );
  const cancelar = new CancelarAdicional(deps.repo, deps.competencias, deps.agendador, () => AGORA);
  const listar = new ListarAdicionais(deps.repo);
  return { lancar, cancelar, listar, linhas, previas, recalculos, filtros };
}

const pedido = {
  medicoId: 'ana',
  tipo: 'avulso' as const,
  competencia: '2026-11',
  data: '2026-11-05',
  valorCentavos: 10000,
  descricao: 'Acerto',
};

describe('LancarAdicional', () => {
  it('na competência aberta: grava e refaz a prévia', async () => {
    const { lancar, linhas, previas } = montar();
    const r = await lancar.executar({ usuarioId: 'u', podeLancarNaFechada: false }, pedido);
    expect(r).toEqual({ id: 'a1', competencia: '2026-11', recalculoId: null });
    expect(linhas.get('a1')).toMatchObject({ valorCentavos: 10000, lancadoPorId: 'u' });
    expect(previas).toEqual(['2026-11']);
  });

  it('pedido numa fechada vai, por padrão, para a próxima aberta', async () => {
    const { lancar } = montar();
    const r = await lancar.executar(
      { usuarioId: 'u', podeLancarNaFechada: false },
      { ...pedido, competencia: '2026-09' },
    );
    expect(r.competencia).toBe('2026-11');
  });

  it('na fechada, com permissão e motivo: fica nela e pede o recálculo', async () => {
    const { lancar, linhas, recalculos, previas } = montar();
    const r = await lancar.executar(
      { usuarioId: 'u', podeLancarNaFechada: true },
      { ...pedido, competencia: '2026-10', lancarNaFechada: true, motivo: 'Plantão esquecido' },
    );
    expect(r).toEqual({ id: 'a1', competencia: '2026-10', recalculoId: 'rc1' });
    expect(recalculos).toEqual([{ competencia: '2026-10', motivo: 'Plantão esquecido' }]);
    expect(linhas.get('a1')?.recalculoId).toBe('rc1');
    expect(previas).toEqual([]);
  });

  it('na fechada sem a permissão própria: recusa', async () => {
    const { lancar } = montar();
    await expect(
      lancar.executar(
        { usuarioId: 'u', podeLancarNaFechada: false },
        { ...pedido, competencia: '2026-10', lancarNaFechada: true, motivo: 'x' },
      ),
    ).rejects.toThrow(LancarNaFechadaSemPermissaoError);
  });

  it('recusa médico que não existe e Peer Review de mês já pago', async () => {
    const { lancar } = montar();
    await expect(
      lancar.executar({ usuarioId: 'u', podeLancarNaFechada: false }, { ...pedido, medicoId: 'x' }),
    ).rejects.toThrow(MedicoNaoEncontradoError);
    const peer = {
      ...pedido,
      tipo: 'peer_review' as const,
      quantidade: 1,
      referenciaDesde: '2026-08',
      referenciaAte: '2026-09',
    };
    await lancar.executar({ usuarioId: 'u', podeLancarNaFechada: false }, peer);
    await expect(
      lancar.executar(
        { usuarioId: 'u', podeLancarNaFechada: false },
        { ...peer, referenciaDesde: '2026-09', referenciaAte: '2026-09' },
      ),
    ).rejects.toThrow(PeerReviewJaPagoError);
  });
});

describe('CancelarAdicional', () => {
  it('cancela (sem apagar) na competência aberta e refaz a prévia', async () => {
    const { lancar, cancelar, linhas, previas } = montar();
    await lancar.executar({ usuarioId: 'u', podeLancarNaFechada: false }, pedido);
    await cancelar.executar('u', 'a1', 'Lançado em dobro');
    expect(linhas.get('a1')).toMatchObject({
      canceladoEm: AGORA,
      motivoCancelamento: 'Lançado em dobro',
    });
    expect(previas).toEqual(['2026-11', '2026-11']);
    await expect(cancelar.executar('u', 'a1', 'de novo')).rejects.toThrow(AdicionalCanceladoError);
  });

  it('o 409 diz qual conflito é: já cancelado ou competência fechada', async () => {
    const { lancar, cancelar, linhas } = montar();
    await lancar.executar({ usuarioId: 'u', podeLancarNaFechada: false }, pedido);
    await cancelar.executar('u', 'a1', 'Lançado em dobro');
    await expect(cancelar.executar('u', 'a1', 'de novo')).rejects.toMatchObject({
      detalhes: { codigo: 'ja_cancelado' },
    });
    await lancar.executar(
      { usuarioId: 'u', podeLancarNaFechada: true },
      { ...pedido, competencia: '2026-10', lancarNaFechada: true, motivo: 'Plantão esquecido' },
    );
    expect(linhas.get('a2')?.competencia).toBe('2026-10');
    const fechada = cancelar.executar('u', 'a2', 'errado');
    await expect(fechada).rejects.toThrow(CancelarNaFechadaError);
    await expect(fechada).rejects.toMatchObject({ detalhes: { codigo: 'competencia_fechada' } });
  });
});

describe('ListarAdicionais', () => {
  it('passa os filtros e a página ao repositório', async () => {
    const { listar, filtros } = montar();
    const r = await listar.executar({
      competencia: '2026-11',
      medicoId: 'ana',
      tipo: 'plantao',
      pagina: 2,
      porPagina: 10,
    });
    expect(filtros).toEqual([
      { competencia: '2026-11', medicoId: 'ana', tipo: 'plantao', pagina: 2, porPagina: 10 },
    ]);
    expect(r).toMatchObject({ pagina: 2, porPagina: 10 });
  });
});
