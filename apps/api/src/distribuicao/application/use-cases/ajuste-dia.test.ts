import { beforeEach, describe, expect, it } from 'vitest';

import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import {
  AjustesDiaEmMemoria,
  CadastrosEmMemoria,
  EscalaDoAjusteEmMemoria,
} from '../../testing/fakes';
import { AlocacaoNaoEncontradaError } from '../erros';
import {
  DefinirAjusteDia,
  ListarAjustesDia,
  ObterAjusteDia,
  PreverPeriodoAjusteDia,
} from './ajuste-dia';

const agora = new Date('2026-11-17T18:00:00Z');
const admin = { usuarioId: 'u1', acessoTotal: true };
const gestora = { usuarioId: 'g1', acessoTotal: false };
const DIA = '2026-11-18';
const liberar = (parcial = {}) => ({
  prioridadeIdsLiberadas: ['urg'],
  segueSla: false,
  clienteId: null,
  laudosExtra: 0,
  ...parcial,
});

describe('ajuste do dia da distribuição', () => {
  let escala: EscalaDoAjusteEmMemoria;
  let repo: AjustesDiaEmMemoria;
  let obter: ObterAjusteDia;
  let definir: DefinirAjusteDia;
  let listar: ListarAjustesDia;
  let prever: PreverPeriodoAjusteDia;

  beforeEach(() => {
    escala = new EscalaDoAjusteEmMemoria();
    escala.alocacoes.set('a1', { id: 'a1', medicoId: 'm1', turnoId: 't1', frenteId: 'f-mama' });
    escala.alocacoes.set('a2', { id: 'a2', medicoId: 'm2', turnoId: 't1', frenteId: 'f-neuro' });
    escala.plantoes.set('a1', new Set([DIA]));
    escala.plantoes.set('a2', new Set([DIA]));
    escala.recortes.set('g1', new Set(['f-mama']));
    repo = new AjustesDiaEmMemoria(escala, new Map([['c1', 'CLINICA X']]));
    const cadastros = new CadastrosEmMemoria();
    cadastros.existentes.set('prioridadeOperacao', new Set(['urg', 'rot']));
    cadastros.existentes.set('cliente', new Set(['c1']));
    obter = new ObterAjusteDia(repo, escala);
    definir = new DefinirAjusteDia(repo, escala, cadastros, () => agora);
    listar = new ListarAjustesDia(repo, escala);
    prever = new PreverPeriodoAjusteDia(repo, escala);
  });

  it('sem ajuste no dia: null', async () => {
    expect(await obter.executar(admin, 'a1', DIA)).toBeNull();
  });

  it('cria e audita com o contexto da escala (médico, turno, frente)', async () => {
    await definir.executar(admin, 'a1', DIA, liberar({ segueSla: true, clienteId: 'c1' }));
    const lido = await obter.executar(admin, 'a1', DIA);
    expect(lido).toMatchObject({
      alocacaoId: 'a1',
      data: DIA,
      prioridadeIdsLiberadas: ['urg'],
      segueSla: true,
      clienteId: 'c1',
      clienteNome: 'CLINICA X',
      medicoId: 'm1',
    });
    expect(repo.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'ajuste_dia_distribuicao',
        entidadeId: lido?.id,
        acao: 'criado',
        depois: {
          alocacaoId: 'a1',
          data: DIA,
          prioridadeIdsLiberadas: ['urg'],
          segueSla: true,
          clienteId: 'c1',
          laudosExtra: 0,
          medicoId: 'm1',
          turnoId: 't1',
          frenteId: 'f-mama',
        },
        em: agora,
      },
    ]);
  });

  it('altera só o que mudou (mesmo id); sem mudança não grava', async () => {
    await definir.executar(admin, 'a1', DIA, liberar());
    const id = (await obter.executar(admin, 'a1', DIA))?.id;
    await definir.executar(admin, 'a1', DIA, liberar());
    expect(repo.gravacoes).toBe(1);
    await definir.executar(admin, 'a1', DIA, liberar({ segueSla: true }));
    expect((await obter.executar(admin, 'a1', DIA))?.id).toBe(id);
    expect(repo.eventos[1]).toMatchObject({
      acao: 'alterado',
      entidadeId: id,
      antes: { segueSla: false },
      depois: { segueSla: true, medicoId: 'm1', data: DIA },
    });
  });

  it('+N laudos de um cliente grava e audita a troca', async () => {
    const extra = liberar({ prioridadeIdsLiberadas: [], clienteId: 'c1', laudosExtra: 30 });
    await definir.executar(admin, 'a1', DIA, extra);
    expect(await obter.executar(admin, 'a1', DIA)).toMatchObject({ laudosExtra: 30 });
    await definir.executar(admin, 'a1', DIA, { ...extra, laudosExtra: 10 });
    expect(repo.eventos[1]).toMatchObject({
      acao: 'alterado',
      antes: { laudosExtra: 30 },
      depois: { laudosExtra: 10 },
    });
  });

  it('ajuste vazio remove (com auditoria); remover o que não existe não faz nada', async () => {
    await definir.executar(admin, 'a1', DIA, liberar({ prioridadeIdsLiberadas: [] }));
    expect(repo.gravacoes).toBe(0);
    await definir.executar(admin, 'a1', DIA, liberar());
    await definir.executar(admin, 'a1', DIA, liberar({ prioridadeIdsLiberadas: [] }));
    expect(await obter.executar(admin, 'a1', DIA)).toBeNull();
    expect(repo.eventos.map((e) => e.acao)).toEqual(['criado', 'excluido']);
  });

  it('só em dia de plantão do vínculo', async () => {
    await expect(definir.executar(admin, 'a1', '2026-11-19', liberar())).rejects.toThrow(
      /não é dia de plantão/,
    );
  });

  it('recusa data inválida, prioridade ou cliente que não existe', async () => {
    await expect(definir.executar(admin, 'a1', '2026-02-30', liberar())).rejects.toBeInstanceOf(
      ConfiguracaoInvalidaError,
    );
    await expect(
      definir.executar(admin, 'a1', DIA, liberar({ prioridadeIdsLiberadas: ['x'] })),
    ).rejects.toThrow(/Prioridade da operação não encontrada/);
    await expect(definir.executar(admin, 'a1', DIA, liberar({ clienteId: 'x' }))).rejects.toThrow(
      /Cliente não encontrado/,
    );
  });

  it('a gestora só vê e mexe nas alocações do recorte dela', async () => {
    await definir.executar(admin, 'a2', DIA, liberar());
    await expect(obter.executar(gestora, 'a2', DIA)).rejects.toBeInstanceOf(
      AlocacaoNaoEncontradaError,
    );
    await expect(definir.executar(gestora, 'a2', DIA, liberar())).rejects.toBeInstanceOf(
      AlocacaoNaoEncontradaError,
    );
    await definir.executar(gestora, 'a1', DIA, liberar());
    expect(
      (await listar.executar(gestora, { de: DIA, ate: DIA })).map((a) => a.alocacaoId),
    ).toEqual(['a1']);
    expect(await listar.executar(admin, { de: DIA, ate: DIA })).toHaveLength(2);
  });

  it('a listagem pede um período válido de até 42 dias', async () => {
    await expect(listar.executar(admin, { de: '2026-11-18', ate: '2026-11-17' })).rejects.toThrow(
      /período/,
    );
    await expect(listar.executar(admin, { de: '2026-11-01', ate: '2026-12-31' })).rejects.toThrow(
      /42 dias/,
    );
  });

  describe('com "Até" (o mesmo ajuste em cada dia de plantão do período)', () => {
    // a1: plantão às quartas e sextas (18, 20, 25 e 27/11).
    const DIAS = ['2026-11-18', '2026-11-20', '2026-11-25', '2026-11-27'];
    beforeEach(() => escala.plantoes.set('a1', new Set(DIAS)));

    it('sem "Até", só o dia (como antes)', async () => {
      await definir.executar(admin, 'a1', DIA, liberar());
      expect([...repo.itens.values()].map((a) => a.data)).toEqual([DIA]);
    });

    it('grava só nos dias de plantão do período, um evento por dia, numa gravação só', async () => {
      await definir.executar(admin, 'a1', DIA, liberar(), '2026-11-26');
      expect([...repo.itens.values()].map((a) => a.data).sort()).toEqual(DIAS.slice(0, 3));
      expect(repo.aplicacoes).toBe(1);
      expect(repo.eventos.map((e) => [e.acao, e.depois?.data])).toEqual([
        ['criado', '2026-11-18'],
        ['criado', '2026-11-20'],
        ['criado', '2026-11-25'],
      ]);
      expect(new Set([...repo.itens.values()].map((a) => a.id)).size).toBe(3);
    });

    it('substitui o ajuste que o dia já tinha (mesmo id) e não regrava o que já está igual', async () => {
      await definir.executar(admin, 'a1', '2026-11-20', liberar({ segueSla: true }));
      await definir.executar(admin, 'a1', '2026-11-25', liberar());
      const id20 = (await obter.executar(admin, 'a1', '2026-11-20'))?.id;
      repo.eventos.length = 0;
      await definir.executar(admin, 'a1', DIA, liberar(), '2026-11-25');
      expect(await obter.executar(admin, 'a1', '2026-11-20')).toMatchObject({
        id: id20,
        segueSla: false,
      });
      expect(repo.eventos.map((e) => [e.acao, e.depois?.data])).toEqual([
        ['criado', '2026-11-18'],
        ['alterado', '2026-11-20'],
      ]);
    });

    it('remover com "Até" tira os ajustes do período (com auditoria) e deixa os de fora', async () => {
      await definir.executar(admin, 'a1', DIA, liberar(), '2026-11-27');
      repo.eventos.length = 0;
      await definir.executar(
        admin,
        'a1',
        DIA,
        liberar({ prioridadeIdsLiberadas: [] }),
        '2026-11-25',
      );
      expect([...repo.itens.values()].map((a) => a.data)).toEqual(['2026-11-27']);
      expect(repo.eventos.map((e) => [e.acao, e.antes?.data])).toEqual([
        ['excluido', '2026-11-18'],
        ['excluido', '2026-11-20'],
        ['excluido', '2026-11-25'],
      ]);
    });

    it('recusa "Até" antes do dia, além do limite, e período sem plantão', async () => {
      await expect(definir.executar(admin, 'a1', DIA, liberar(), '2026-11-17')).rejects.toThrow(
        /antes do dia/,
      );
      await expect(definir.executar(admin, 'a1', DIA, liberar(), '2027-01-30')).rejects.toThrow(
        /31 dias/,
      );
      await expect(
        definir.executar(admin, 'a1', '2026-11-21', liberar(), '2026-11-24'),
      ).rejects.toThrow(/Nenhum dia de plantão/);
      expect(repo.aplicacoes).toBe(0);
    });

    it('a prévia diz os dias de plantão do período e quais já têm ajuste', async () => {
      await definir.executar(admin, 'a1', '2026-11-20', liberar());
      expect(await prever.executar(admin, 'a1', DIA, '2026-11-25')).toEqual({
        dias: DIAS.slice(0, 3),
        diasComAjuste: ['2026-11-20'],
        ateMaximo: '2026-12-18',
      });
      await expect(prever.executar(gestora, 'a2', DIA, DIA)).rejects.toBeInstanceOf(
        AlocacaoNaoEncontradaError,
      );
    });
  });
});
