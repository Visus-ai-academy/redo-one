import { beforeEach, describe, expect, it } from 'vitest';

import type { Tipificador } from '../../../faturamento/domain/tipificacao';
import { CompetenciasEmMemoria } from '../../../faturamento/testing/fakes';
import type { CadastrosIngestao, LaudoPreparado } from '../../domain/preparar-laudo';
import { LaudosEmMemoria } from '../../testing/fakes';
import { ReclassificarTipificacao } from './reclassificar-tipificacao';

const agora = new Date('2026-11-24T12:00:00Z');

const laudo = (identidade: string, campos: Partial<LaudoPreparado> = {}): LaudoPreparado =>
  ({
    identidade,
    empresaOrigem: 'CLINICA X',
    clienteId: 'c-x',
    unidadeId: null,
    modalidadeId: 'CT',
    especialidadeId: 'MI',
    prioridadeId: 'ROTINA',
    medicoId: 'ana',
    competencia: '2026-11',
    ...campos,
  }) as LaudoPreparado;

/** CEDI_RJ é unidade do CEDIDIAG. */
const cadastros = {
  resolverCliente: (e: string) => (e === 'CEDI_RJ' ? 'cedidiag' : e === 'CLINICA X' ? 'c-x' : null),
  resolverUnidade: (e: string) => (e === 'CEDI_RJ' ? 'cedi-rj' : null),
} as unknown as CadastrosIngestao;

describe('ReclassificarTipificacao', () => {
  let laudos: LaudosEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let tipificar: Tipificador | null;
  let reclassificar: ReclassificarTipificacao;

  const guardar = (...lista: LaudoPreparado[]) => {
    for (const l of lista)
      laudos.laudos.set(l.identidade, { ...l, removido: false, importacaoId: 'i' });
  };

  beforeEach(() => {
    laudos = new LaudosEmMemoria();
    competencias = new CompetenciasEmMemoria();
    // NC-NF para a unidade; CO para o resto.
    tipificar = (l) =>
      l.unidadeId === 'cedi-rj'
        ? { regraId: 'NC', subregraId: 'NC-NF', fatura: false }
        : { regraId: 'CO', subregraId: null, fatura: true };
    reclassificar = new ReclassificarTipificacao(
      laudos,
      competencias,
      { carregar: async () => cadastros },
      { carregar: async () => tipificar },
      () => agora,
    );
    guardar(
      laudo('x1'),
      // Gravado antes da unidade de origem existir no laudo.
      laudo('u1', { empresaOrigem: 'CEDI_RJ', clienteId: 'cedidiag' }),
      laudo('f1', { competencia: '2026-10' }),
    );
  });

  it('tipifica os laudos das competências abertas e preenche a unidade de origem', async () => {
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });

    expect(await reclassificar.executar({ clienteIds: null })).toEqual({ lidos: 2, alterados: 2 });
    expect(laudos.classificacoes.get('x1')).toEqual({
      regraId: 'CO',
      subregraId: null,
      fatura: true,
    });
    expect(laudos.classificacoes.get('u1')).toEqual({
      regraId: 'NC',
      subregraId: 'NC-NF',
      fatura: false,
    });
    expect(laudos.laudos.get('u1')?.unidadeId).toBe('cedi-rj');
    // Competência fechada não muda.
    expect(laudos.classificacoes.has('f1')).toBe(false);
  });

  it('só os clientes pedidos; rodar de novo não grava nada (idempotente)', async () => {
    expect(await reclassificar.executar({ clienteIds: ['cedidiag'] })).toEqual({
      lidos: 1,
      alterados: 1,
    });
    expect([...laudos.classificacoes.keys()]).toEqual(['u1']);
    expect(await reclassificar.executar({ clienteIds: ['cedidiag'] })).toEqual({
      lidos: 1,
      alterados: 0,
    });
  });

  it('relê as bloqueadas a cada lote: a competência fechada no meio do job não muda mais', async () => {
    laudos.laudos.clear();
    // Dois lotes (5.000 + 1) de 2026-11; fecha 2026-11 depois de ler o primeiro.
    guardar(...Array.from({ length: 5001 }, (_, i) => laudo(`n${String(i).padStart(5, '0')}`)));
    const listar = competencias.listar.bind(competencias);
    let chamadas = 0;
    competencias.listar = async () => {
      chamadas += 1;
      if (chamadas === 2)
        competencias.competencias.set('2026-11', { status: 'fechada', importacaoTravada: false });
      return listar();
    };

    const r = await reclassificar.executar({ clienteIds: null });

    // O primeiro lote foi lido com 2026-11 aberta, mas a lista relida já a traz fechada: nada grava.
    expect(r).toEqual({ lidos: 5000, alterados: 0 });
    expect(laudos.classificacoes.size).toBe(0);
  });

  it('sem regras de tipificação, não faz nada', async () => {
    tipificar = null;
    expect(await reclassificar.executar({ clienteIds: null })).toEqual({ lidos: 0, alterados: 0 });
    expect(laudos.classificacoes.size).toBe(0);
  });
});
