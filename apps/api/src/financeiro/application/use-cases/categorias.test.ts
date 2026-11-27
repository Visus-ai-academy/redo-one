import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import type { DadosCategoria } from '../../domain/categoria-financeira';
import {
  DadoEmUsoError,
  DadosInvalidosError,
  EmUsoError,
  NaoEncontradoError,
} from '../../domain/erros';
import { CategoriasEmMemoria } from '../../testing/fakes';
import { ConsultarCategorias, ExcluirCategoria, SalvarCategoria } from './categorias';

const em = new Date('2026-11-27T12:00:00Z');
const relogio = { now: () => em };
const ator = { usuarioId: 'u1' };
const dados = (parcial: Partial<DadosCategoria> = {}): DadosCategoria => ({
  tipo: 'despesa',
  nome: 'Ocupação',
  paiId: null,
  codigoContabil: null,
  ativa: true,
  ...parcial,
});

describe('categorias financeiras', () => {
  let repo: CategoriasEmMemoria;
  let auditoria: InMemoryAuditoria;
  let salvar: SalvarCategoria;

  beforeEach(() => {
    repo = new CategoriasEmMemoria();
    auditoria = new InMemoryAuditoria();
    salvar = new SalvarCategoria(repo, auditoria, relogio);
  });

  it('cria e audita a criação com os dados normalizados', async () => {
    const id = await salvar.criar(ator, dados({ nome: '  Ocupação ', codigoContabil: '3.1' }));

    expect(await new ConsultarCategorias(repo).obter(id)).toMatchObject({
      nome: 'Ocupação',
      codigoContabil: '3.1',
    });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'categoria_financeira',
        entidadeId: id,
        acao: 'criado',
        depois: expect.objectContaining({ nome: 'Ocupação', tipo: 'despesa' }),
        em,
      }),
    ]);
  });

  it('recusa o mesmo nome no mesmo grupo e tipo, sem diferenciar maiúsculas', async () => {
    await salvar.criar(ator, dados());
    await expect(salvar.criar(ator, dados({ nome: 'OCUPAÇÃO' }))).rejects.toBeInstanceOf(
      DadoEmUsoError,
    );
    // Em receitas, o nome pode repetir.
    await expect(salvar.criar(ator, dados({ tipo: 'receita' }))).resolves.toEqual(
      expect.any(String),
    );
  });

  it('põe a categoria num grupo do mesmo tipo; recusa grupo de receita para despesa', async () => {
    const grupo = await salvar.criar(ator, dados());
    const receita = await salvar.criar(ator, dados({ tipo: 'receita', nome: 'Laudos' }));
    const aluguel = await salvar.criar(ator, dados({ nome: 'Aluguel', paiId: grupo }));

    expect((await new ConsultarCategorias(repo).obter(aluguel)).grupoNome).toBe('Ocupação');
    await expect(salvar.criar(ator, dados({ nome: 'Luz', paiId: receita }))).rejects.toBeInstanceOf(
      DadosInvalidosError,
    );
  });

  it('editar audita só o que mudou; sem mudança, nada é registrado', async () => {
    const id = await salvar.criar(ator, dados());
    auditoria.eventos.length = 0;

    await salvar.atualizar(ator, id, dados({ codigoContabil: '3.1' }));
    await salvar.atualizar(ator, id, dados({ codigoContabil: '3.1' }));

    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        acao: 'alterado',
        antes: { codigoContabil: null },
        depois: { codigoContabil: '3.1' },
      }),
    ]);
  });

  it('grupo com categorias dentro não muda de tipo', async () => {
    const grupo = await salvar.criar(ator, dados());
    await salvar.criar(ator, dados({ nome: 'Aluguel', paiId: grupo }));

    await expect(salvar.atualizar(ator, grupo, dados({ tipo: 'receita' }))).rejects.toBeInstanceOf(
      DadosInvalidosError,
    );
  });

  it('editar ou excluir o que não existe dá não encontrado', async () => {
    await expect(salvar.atualizar(ator, 'x', dados())).rejects.toBeInstanceOf(NaoEncontradoError);
    await expect(
      new ExcluirCategoria(repo, auditoria, relogio).executar(ator, 'x'),
    ).rejects.toBeInstanceOf(NaoEncontradoError);
  });

  it('exclui e audita; em uso (com categorias dentro), recusa e pede para desativar', async () => {
    const excluir = new ExcluirCategoria(repo, auditoria, relogio);
    const grupo = await salvar.criar(ator, dados());
    const filha = await salvar.criar(ator, dados({ nome: 'Aluguel', paiId: grupo }));

    await expect(excluir.executar(ator, grupo)).rejects.toThrow(
      'A categoria está em uso (tem categorias dentro, fornecedores ou títulos). Desative-a em vez de excluir.',
    );
    await expect(excluir.executar(ator, grupo)).rejects.toBeInstanceOf(EmUsoError);
    await excluir.executar(ator, filha);

    expect(await repo.buscar(filha)).toBeNull();
    expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'excluido', entidadeId: filha });
  });
});
