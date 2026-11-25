import { beforeEach, describe, expect, it } from 'vitest';

import { CompetenciasEmMemoria } from '../../../faturamento/testing/fakes';
import type { CadastrosIngestao, LaudoPreparado } from '../../domain/preparar-laudo';
import { LaudosEmMemoria } from '../../testing/fakes';
import { ReresolverClientes } from './reresolver-clientes';

const agora = new Date('2026-11-25T12:00:00Z');

const laudo = (
  identidade: string,
  campos: Partial<LaudoPreparado> & { removido?: boolean } = {},
): LaudoPreparado & { removido?: boolean } =>
  ({
    identidade,
    empresaOrigem: 'CLINICA X',
    clienteId: 'c-x',
    unidadeId: null,
    competencia: '2026-11',
    ...campos,
  }) as LaudoPreparado & { removido?: boolean };

/** Cadastro de agora: CEDI_RO virou unidade do CEDIDIAG; NOVA ganhou cadastro; SUMIU perdeu o apelido. */
const cadastros = {
  resolverCliente: (e: string) =>
    ({ CEDI_RO: 'cedidiag', 'CLINICA X': 'c-x', NOVA: 'c-nova' })[e] ?? null,
  resolverUnidade: (e: string) => (e === 'CEDI_RO' ? 'cedi-ro' : null),
} as unknown as CadastrosIngestao;

describe('ReresolverClientes', () => {
  let laudos: LaudosEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let reresolver: ReresolverClientes;

  const guardar = (...lista: (LaudoPreparado & { removido?: boolean })[]) => {
    for (const l of lista)
      laudos.laudos.set(l.identidade, { removido: false, ...l, importacaoId: 'i' });
  };

  beforeEach(() => {
    laudos = new LaudosEmMemoria();
    competencias = new CompetenciasEmMemoria();
    reresolver = new ReresolverClientes(
      laudos,
      competencias,
      { carregar: async () => cadastros },
      () => agora,
    );
  });

  it('leva o cliente e a unidade dos laudos das competências abertas ao cadastro de agora', async () => {
    guardar(
      laudo('x1'),
      // Gravado antes da unificação (o apelido já levava ao principal), e removido depois.
      laudo('ro1', { empresaOrigem: 'CEDI_RO', clienteId: 'cedidiag', removido: true }),
      // Sem cadastro na importação.
      laudo('n1', { empresaOrigem: 'NOVA', clienteId: null }),
      // O apelido que levava ao cliente foi apagado: fica sem cliente, como a importação faria.
      laudo('s1', { empresaOrigem: 'SUMIU', clienteId: 'c-antigo' }),
    );

    expect(await reresolver.executar()).toEqual({ lidos: 4, alterados: 3 });
    expect(laudos.laudos.get('ro1')).toMatchObject({ clienteId: 'cedidiag', unidadeId: 'cedi-ro' });
    expect(laudos.laudos.get('n1')).toMatchObject({ clienteId: 'c-nova', unidadeId: null });
    expect(laudos.laudos.get('s1')).toMatchObject({ clienteId: null, unidadeId: null });
    expect(laudos.laudos.get('x1')).toMatchObject({ clienteId: 'c-x', unidadeId: null });
  });

  it('não muda laudo de competência fechada ou travada', async () => {
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    competencias.competencias.set('2026-09', { status: 'aberta', importacaoTravada: true });
    guardar(
      laudo('f1', { empresaOrigem: 'CEDI_RO', clienteId: 'cedidiag', competencia: '2026-10' }),
      laudo('t1', { empresaOrigem: 'NOVA', clienteId: null, competencia: '2026-09' }),
    );

    expect(await reresolver.executar()).toEqual({ lidos: 0, alterados: 0 });
    expect(laudos.laudos.get('f1')?.unidadeId).toBeNull();
    expect(laudos.laudos.get('t1')?.clienteId).toBeNull();
  });

  it('é idempotente: a segunda execução não grava nada', async () => {
    guardar(laudo('ro1', { empresaOrigem: 'CEDI_RO', clienteId: 'cedidiag' }));

    await reresolver.executar();
    expect(await reresolver.executar()).toEqual({ lidos: 1, alterados: 0 });
  });

  it('percorre todos os lotes', async () => {
    guardar(
      ...Array.from({ length: 5001 }, (_, i) =>
        laudo(`l${String(i).padStart(5, '0')}`, { empresaOrigem: 'NOVA', clienteId: null }),
      ),
    );

    expect(await reresolver.executar()).toEqual({ lidos: 5001, alterados: 5001 });
  });
});
