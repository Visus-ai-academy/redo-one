import { describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import type { TipoAviso } from '../../domain/preparar-laudo';
import { ConfiguracaoTipoInvalidaError, TipoAvisoNaoEncontradoError } from '../erros';
import type { ConfiguracaoTipoAviso, TiposAvisoRepository } from '../ports/tipos-aviso.repository';
import { ConfigurarTipoAviso, ListarTiposAviso } from './tipos-aviso';

const agora = new Date('2026-11-25T12:00:00Z');
const PAPEIS = [
  { id: 'p-fat', nome: 'Financeiro' },
  { id: 'p-op', nome: 'Operação' },
];

class TiposEmMemoria implements TiposAvisoRepository {
  readonly itens = new Map<TipoAviso, ConfiguracaoTipoAviso>([
    ['cliente', { tipo: 'cliente', impedeFecharCompetencia: true, responsaveis: [], pendentes: 3 }],
    ['medico', { tipo: 'medico', impedeFecharCompetencia: false, responsaveis: [], pendentes: 0 }],
  ]);
  async listar() {
    return [...this.itens.values()];
  }
  async obter(tipo: TipoAviso) {
    return this.itens.get(tipo) ?? null;
  }
  async salvar(
    tipo: TipoAviso,
    d: { impedeFecharCompetencia: boolean; papeisIds: readonly string[] },
  ) {
    const atual = this.itens.get(tipo);
    if (!atual) return;
    this.itens.set(tipo, {
      ...atual,
      impedeFecharCompetencia: d.impedeFecharCompetencia,
      responsaveis: PAPEIS.filter((p) => d.papeisIds.includes(p.id)),
    });
  }
  async tiposDosPapeis() {
    return [];
  }
  async papeis() {
    return PAPEIS;
  }
  async papeisInexistentes(ids: readonly string[]) {
    return ids.filter((id) => !PAPEIS.some((p) => p.id === id));
  }
}

describe('ListarTiposAviso', () => {
  it('devolve a configuração de cada tipo e os papéis que se pode escolher', async () => {
    const r = await new ListarTiposAviso(new TiposEmMemoria()).executar();
    expect(r.papeis).toEqual(PAPEIS);
    expect(r.tipos.map((t) => t.tipo)).toEqual(['cliente', 'medico']);
  });
});

describe('ConfigurarTipoAviso', () => {
  const montar = () => {
    const repo = new TiposEmMemoria();
    const auditoria = new InMemoryAuditoria();
    return { repo, auditoria, caso: new ConfigurarTipoAviso(repo, auditoria, () => agora) };
  };

  it('troca responsáveis e a trava, e audita antes e depois', async () => {
    const { repo, auditoria, caso } = montar();

    await caso.executar('u1', 'medico', {
      impedeFecharCompetencia: true,
      papeisIds: ['p-op', 'p-fat', 'p-op'],
    });

    expect(repo.itens.get('medico')).toMatchObject({
      impedeFecharCompetencia: true,
      responsaveis: PAPEIS,
    });
    expect(auditoria.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'tipo_aviso',
        entidadeId: 'medico',
        acao: 'configurado',
        antes: { impedeFecharCompetencia: false, responsaveis: [] },
        depois: { impedeFecharCompetencia: true, responsaveis: ['Financeiro', 'Operação'] },
        em: agora,
      },
    ]);
  });

  it('sem mudança, não grava nem audita', async () => {
    const { auditoria, caso } = montar();
    await caso.executar('u1', 'cliente', { impedeFecharCompetencia: true, papeisIds: [] });
    expect(auditoria.eventos).toEqual([]);
  });

  it('recusa tipo sem configuração e papel que não existe', async () => {
    const { caso } = montar();
    await expect(
      caso.executar('u1', 'preco_repetido', { impedeFecharCompetencia: true, papeisIds: [] }),
    ).rejects.toThrow(TipoAvisoNaoEncontradoError);
    await expect(
      caso.executar('u1', 'cliente', { impedeFecharCompetencia: true, papeisIds: ['x'] }),
    ).rejects.toThrow(ConfiguracaoTipoInvalidaError);
  });
});
