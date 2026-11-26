import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { ParametrosInvalidosError } from '../../domain/parametros-demonstrativo';
import { VigenciaPrecoInvalidaError } from '../../domain/versoes-preco';
import { CompetenciasEmMemoria, ParametrosDemonstrativoEmMemoria } from '../../testing/fakes';
import {
  ListarAlternativasPreco,
  ListarParametrosDemonstrativo,
  MudarAlternativaPreco,
  MudarParametrosDemonstrativo,
} from './parametros-demonstrativo';

// 26/11/2026 em Brasília; outubro fechado.
const agora = new Date('2026-11-26T15:00:00Z');

describe('parâmetros do demonstrativo', () => {
  let repo: ParametrosDemonstrativoEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let auditoria: InMemoryAuditoria;
  const dados = {
    cobraDuplicados: false,
    cobraClientesInativos: false,
    categoriaPadraoId: 'sc',
    prioridadePadraoId: null,
  };

  beforeEach(() => {
    repo = new ParametrosDemonstrativoEmMemoria();
    repo.categorias.add('sc');
    repo.prioridades.add('plantao').add('urgencia');
    competencias = new CompetenciasEmMemoria();
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    auditoria = new InMemoryAuditoria();
  });

  const mudar = () => new MudarParametrosDemonstrativo(repo, competencias, auditoria, () => agora);

  it('sem versão gravada, vale o inicial: cobra duplicados, não cobra inativos', async () => {
    const r = await new ListarParametrosDemonstrativo(repo, competencias, () => agora).executar();
    expect(r.vigente).toEqual({
      cobraDuplicados: true,
      cobraClientesInativos: false,
      categoriaPadraoId: null,
      prioridadePadraoId: null,
    });
    expect(r.aPartirDeMinimo).toBe('2026-11');
    expect(r.aPartirDeSugerido).toBe('2026-12');
    expect(r.historico).toEqual([]);
  });

  it('grava a versão a partir da competência aberta pedida, com auditoria', async () => {
    const id = await mudar().executar('u1', { aPartirDe: '2026-11', ...dados });

    expect(repo.parametros.map((p) => [p.id, p.desde, p.cobraDuplicados])).toEqual([
      [id, '2026-11', false],
    ]);
    expect(auditoria.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'parametros_demonstrativo',
        entidadeId: id,
        acao: 'criado',
        depois: { desde: '2026-11', ...dados },
        em: agora,
      },
    ]);
    const r = await new ListarParametrosDemonstrativo(repo, competencias, () => agora).executar();
    expect(r.vigente.cobraDuplicados).toBe(false);
  });

  it('nunca a partir de competência fechada', async () => {
    await expect(mudar().executar('u1', { aPartirDe: '2026-10', ...dados })).rejects.toBeInstanceOf(
      VigenciaPrecoInvalidaError,
    );
  });

  it('recusa categoria ou prioridade padrão que não existem', async () => {
    await expect(
      mudar().executar('u1', { aPartirDe: '2026-11', ...dados, categoriaPadraoId: 'x' }),
    ).rejects.toBeInstanceOf(ParametrosInvalidosError);
    await expect(
      mudar().executar('u1', { aPartirDe: '2026-11', ...dados, prioridadePadraoId: 'x' }),
    ).rejects.toBeInstanceOf(ParametrosInvalidosError);
  });

  it('prioridade alternativa: grava a cadeia da prioridade e lista o que vale', async () => {
    const caso = new MudarAlternativaPreco(repo, competencias, auditoria, () => agora);
    await caso.executar('u1', {
      aPartirDe: '2026-11',
      prioridadeId: 'plantao',
      alternativaId: 'urgencia',
    });
    await caso.executar('u1', {
      aPartirDe: '2026-12',
      prioridadeId: 'plantao',
      alternativaId: null,
    });

    const r = await new ListarAlternativasPreco(repo, competencias, () => agora).executar();
    expect(r.vigentes).toEqual([{ prioridadeId: 'plantao', alternativaId: 'urgencia' }]);
    expect(r.historico.map((h) => [h.desde, h.alternativaId])).toEqual([
      ['2026-12', null],
      ['2026-11', 'urgencia'],
    ]);
    expect(auditoria.eventos.map((e) => [e.entidade, e.acao])).toEqual([
      ['prioridade_alternativa_preco', 'criado'],
      ['prioridade_alternativa_preco', 'criado'],
    ]);
  });

  it('a alternativa tem de existir e ser outra prioridade', async () => {
    const caso = new MudarAlternativaPreco(repo, competencias, auditoria, () => agora);
    await expect(
      caso.executar('u1', {
        aPartirDe: '2026-11',
        prioridadeId: 'plantao',
        alternativaId: 'plantao',
      }),
    ).rejects.toBeInstanceOf(ParametrosInvalidosError);
    await expect(
      caso.executar('u1', { aPartirDe: '2026-11', prioridadeId: 'plantao', alternativaId: 'x' }),
    ).rejects.toBeInstanceOf(ParametrosInvalidosError);
  });
});
