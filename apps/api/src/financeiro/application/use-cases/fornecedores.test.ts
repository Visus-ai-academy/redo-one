import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import {
  DadoEmUsoError,
  DadosInvalidosError,
  EmUsoError,
  NaoEncontradoError,
} from '../../domain/erros';
import { type DadosFornecedor, FORNECEDOR_VAZIO } from '../../domain/fornecedor';
import { CategoriasEmMemoria, FornecedoresEmMemoria } from '../../testing/fakes';
import { ConsultarFornecedores, ExcluirFornecedor, SalvarFornecedor } from './fornecedores';

const em = new Date('2026-11-27T12:00:00Z');
const relogio = { now: () => em };
const ator = { usuarioId: 'u1' };
const dados = (parcial: Partial<DadosFornecedor> = {}): DadosFornecedor => ({
  ...FORNECEDOR_VAZIO,
  razaoSocial: 'Ômega Contábil',
  cnpj: '12345678000190',
  ...parcial,
});

describe('fornecedores', () => {
  let categorias: CategoriasEmMemoria;
  let repo: FornecedoresEmMemoria;
  let auditoria: InMemoryAuditoria;
  let salvar: SalvarFornecedor;
  let consultar: ConsultarFornecedores;
  let contabilidade: string;

  beforeEach(async () => {
    categorias = new CategoriasEmMemoria();
    contabilidade = await categorias.criar({
      tipo: 'despesa',
      nome: 'Contabilidade',
      paiId: null,
      codigoContabil: null,
      ativa: true,
    });
    repo = new FornecedoresEmMemoria(categorias);
    auditoria = new InMemoryAuditoria();
    salvar = new SalvarFornecedor(repo, categorias, auditoria, relogio);
    consultar = new ConsultarFornecedores(repo);
  });

  it('cria com a categoria padrão de despesa e audita', async () => {
    const id = await salvar.criar(ator, dados({ categoriaPadraoId: contabilidade }));

    expect(await consultar.obter(id)).toMatchObject({
      razaoSocial: 'Ômega Contábil',
      categoriaPadraoNome: 'Contabilidade',
    });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        entidade: 'fornecedor',
        entidadeId: id,
        acao: 'criado',
        depois: expect.objectContaining({ cnpj: '12345678000190' }),
      }),
    ]);
  });

  it('recusa categoria padrão de receita', async () => {
    const receita = await categorias.criar({
      tipo: 'receita',
      nome: 'Laudos',
      paiId: null,
      codigoContabil: null,
      ativa: true,
    });
    await expect(salvar.criar(ator, dados({ categoriaPadraoId: receita }))).rejects.toBeInstanceOf(
      DadosInvalidosError,
    );
  });

  it('o CNPJ e o CPF não se repetem; o erro cita o outro fornecedor', async () => {
    await salvar.criar(ator, dados());
    await expect(salvar.criar(ator, dados({ razaoSocial: 'Outro' }))).rejects.toThrow(
      'O CNPJ já é do fornecedor Ômega Contábil.',
    );
    const pf = dados({ tipoPessoa: 'PF', razaoSocial: 'Ana', cnpj: null, cpf: '12345678909' });
    await salvar.criar(ator, pf);
    await expect(salvar.criar(ator, { ...pf, razaoSocial: 'Ana 2' })).rejects.toBeInstanceOf(
      DadoEmUsoError,
    );
  });

  it('editar audita só o que mudou; o próprio CNPJ não conta como repetido', async () => {
    const id = await salvar.criar(ator, dados());
    auditoria.eventos.length = 0;

    await salvar.atualizar(ator, id, dados({ ativo: false }));

    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        acao: 'alterado',
        antes: { ativo: true },
        depois: { ativo: false },
      }),
    ]);
  });

  it('exclui e audita; com títulos, recusa e pede para desativar', async () => {
    const excluir = new ExcluirFornecedor(repo, auditoria, relogio);
    const usado = await salvar.criar(ator, dados());
    const livre = await salvar.criar(ator, dados({ razaoSocial: 'B', cnpj: '11222333000144' }));
    repo.usados.add(usado);

    await expect(excluir.executar(ator, usado)).rejects.toThrow(
      'O fornecedor tem títulos lançados. Desative-o em vez de excluir.',
    );
    await expect(excluir.executar(ator, usado)).rejects.toBeInstanceOf(EmUsoError);
    await excluir.executar(ator, livre);
    expect(await repo.buscar(livre)).toBeNull();
    await expect(excluir.executar(ator, 'x')).rejects.toBeInstanceOf(NaoEncontradoError);
  });
});
