import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  ExportarPrecos,
  HistoricoPreco,
  ListarPrecos,
  MudarPrecos,
  OpcoesPrecos,
} from '../../application/use-cases/precos';
import { PrecosController } from './precos.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const corpo = {
  modalidadeId: 'm',
  especialidadeId: 'e',
  categoriaId: 'c',
  prioridadeId: 'p',
  faixaInicio: null,
  faixaFim: null,
  condVolume: 'MOD_ESP_CAT' as const,
  valor: 63,
  aPartirDe: '2026-12',
};

describe('controller dos preços', () => {
  it('ler pede faturamento.ver; mudar pede faturamento.precos.editar', () => {
    const p = PrecosController.prototype;
    expect(reflector.get(PATH_METADATA, PrecosController)).toBe('faturamento/precos');
    for (const m of [p.opcoes, p.listar, p.historico, p.exportar])
      expect(exigidas(m)).toEqual(['faturamento.ver']);
    for (const m of [p.incluir, p.alterar, p.encerrar, p.importar])
      expect(exigidas(m)).toEqual(['faturamento.precos.editar']);
  });

  it('passa o dono, os dados sem o "a partir de" e quem está logado', async () => {
    const mudar = {
      incluir: vi.fn(async () => 'novo'),
      alterar: vi.fn(async () => 'v2'),
      encerrar: vi.fn(async () => undefined),
      importar: vi.fn(async () => ({ incluidos: 1, alterados: 0, iguais: 0 })),
    };
    const listar = { executar: vi.fn(async () => ({ itens: [], total: 0 })) };
    const c = new PrecosController(
      listar as unknown as ListarPrecos,
      {} as HistoricoPreco,
      mudar as unknown as MudarPrecos,
      {} as ExportarPrecos,
      {} as OpcoesPrecos,
    );
    const { aPartirDe, ...dados } = corpo;
    expect(await c.incluir(ator, 'contratado', 'ct', corpo)).toEqual({ id: 'novo' });
    expect(mudar.incluir).toHaveBeenCalledWith(
      'u1',
      { tipo: 'contratado', id: 'ct' },
      dados,
      aPartirDe,
    );
    expect(await c.alterar(ator, 'cliente', 'c1', 'v1', corpo)).toEqual({ id: 'v2' });
    expect(mudar.alterar).toHaveBeenCalledWith(
      'u1',
      { tipo: 'cliente', id: 'c1' },
      'v1',
      dados,
      aPartirDe,
    );
    await c.encerrar(ator, 'cliente', 'c1', 'v1', { aPartirDe });
    expect(mudar.encerrar).toHaveBeenCalledWith(
      'u1',
      { tipo: 'cliente', id: 'c1' },
      'v1',
      aPartirDe,
    );
    expect(
      await c.listar('cliente', 'c1', { pagina: 2, porPagina: 10, busca: 'neuro' }),
    ).toMatchObject({ pagina: 2, porPagina: 10 });
    expect(listar.executar).toHaveBeenCalledWith(
      { tipo: 'cliente', id: 'c1' },
      { pagina: 2, porPagina: 10, busca: 'neuro' },
    );
  });
});
