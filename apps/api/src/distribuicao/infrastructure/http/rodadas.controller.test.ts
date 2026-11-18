import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { RodadasController } from './rodadas.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const principal = (permissoes: string[] = []) =>
  ({
    tipo: 'usuario',
    usuarioId: 'u1',
    acessoTotal: false,
    permissoes: new Set(permissoes),
  }) as unknown as PrincipalUsuario;

const casos = () => {
  const fn = () => ({ executar: vi.fn(async () => undefined) });
  return {
    criar: { executar: vi.fn(async () => 'r1') },
    ajustarProposta: fn(),
    aprovar: fn(),
    pausar: fn(),
    retomar: fn(),
    encerrar: fn(),
    cancelar: fn(),
    reler: fn(),
    ajustarMedicos: fn(),
    situacao: fn(),
    consultar: {
      viva: vi.fn(async () => null),
      porId: vi.fn(async () => ({})),
      historico: vi.fn(async () => ({ itens: [], total: 0 })),
    },
    designacoes: { executar: vi.fn(async () => ({ itens: [], total: 0 })) },
    filaDoMomento: fn(),
  };
};

const controller = (c: ReturnType<typeof casos>) =>
  new RodadasController(
    c.criar as never,
    c.ajustarProposta as never,
    c.aprovar as never,
    c.pausar as never,
    c.retomar as never,
    c.encerrar as never,
    c.cancelar as never,
    c.reler as never,
    c.ajustarMedicos as never,
    c.situacao as never,
    c.consultar as never,
    c.designacoes as never,
    c.filaDoMomento as never,
  );

describe('controller das rodadas', () => {
  it('cada rota pede a permissão certa', () => {
    const p = RodadasController.prototype;
    expect(reflector.get(PATH_METADATA, RodadasController)).toBe('distribuicao/rodadas');
    for (const leitura of [p.viva, p.historico, p.fila, p.obter, p.situacao, p.designacoes]) {
      expect(exigidas(leitura)).toEqual(['distribuicao.ver']);
    }
    expect(exigidas(p.criar)).toEqual(['distribuicao.rodada.iniciar']);
    expect(exigidas(p.aprovar)).toEqual(['distribuicao.rodada.aprovar']);
    expect(exigidas(p.ajustarProposta)).toEqual(['distribuicao.rodada.ajustar']);
    for (const controle of [p.pausar, p.retomar, p.encerrar, p.cancelar, p.reler, p.medicos]) {
      expect(exigidas(controle)).toEqual(['distribuicao.rodada.controlar']);
    }
  });

  it('cria em nome de quem está logado, com o recorte dele', async () => {
    const c = casos();
    const recortes = {
      turnoIds: [],
      frenteIds: [],
      prioridadeOperacaoIds: [],
      clienteIds: [],
      medicosExcluidos: [],
      medicosIncluidos: [],
    };
    expect(await controller(c).criar(principal(), recortes)).toEqual({ id: 'r1' });
    expect(c.criar.executar).toHaveBeenCalledWith(
      { usuarioId: 'u1', acessoTotal: false },
      recortes,
    );
  });

  it('o nome do paciente só é pedido com distribuicao.paciente.ver', async () => {
    const c = casos();
    const q = { pagina: 1, porPagina: 25 };
    await controller(c).designacoes(principal(), 'r1', q);
    expect(c.designacoes.executar).toHaveBeenLastCalledWith(
      { usuarioId: 'u1', acessoTotal: false },
      'r1',
      q,
      false,
    );
    await controller(c).designacoes(principal(['distribuicao.paciente.ver']), 'r1', q);
    expect(c.designacoes.executar).toHaveBeenLastCalledWith(expect.anything(), 'r1', q, true);
  });

  it('sem rodada viva, devolve nula embrulhada', async () => {
    expect(await controller(casos()).viva()).toEqual({ rodada: null });
  });
});
