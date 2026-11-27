import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import type { DadosContaBancaria } from '../../domain/conta-bancaria';
import {
  DadoEmUsoError,
  DadosInvalidosError,
  EmUsoError,
  NaoEncontradoError,
} from '../../domain/erros';
import { ContasBancariasEmMemoria, EmpresasEmMemoria } from '../../testing/fakes';
import {
  ConsultarContasBancarias,
  ExcluirContaBancaria,
  SalvarContaBancaria,
} from './contas-bancarias';

const em = new Date('2026-11-27T12:00:00Z');
const relogio = { now: () => em };
const ator = { usuarioId: 'u1' };
const dados = (parcial: Partial<DadosContaBancaria> = {}): DadosContaBancaria => ({
  contratadoId: 'tele',
  apelido: 'Itaú cobrança',
  tipo: 'corrente',
  bancoCodigo: '341',
  agencia: '0123',
  conta: '45678',
  digito: '9',
  saldoInicialCentavos: 100_00,
  saldoInicialEm: '2026-12-01',
  integracao: 'nenhuma',
  credencial: null,
  padraoRecebimento: false,
  ativa: true,
  ...parcial,
});

describe('contas bancárias', () => {
  let repo: ContasBancariasEmMemoria;
  let empresas: EmpresasEmMemoria;
  let auditoria: InMemoryAuditoria;
  let salvar: SalvarContaBancaria;
  let variaveis: Set<string>;
  let consultar: ConsultarContasBancarias;

  beforeEach(() => {
    empresas = new EmpresasEmMemoria([
      { id: 'tele', nome: 'TeleImagem', usaFinanceiro: true },
      { id: 'rn', nome: 'Radiologia Nacional', usaFinanceiro: false },
    ]);
    repo = new ContasBancariasEmMemoria(empresas);
    auditoria = new InMemoryAuditoria();
    salvar = new SalvarContaBancaria(repo, empresas, auditoria, relogio);
    variaveis = new Set();
    consultar = new ConsultarContasBancarias(repo, { existe: (nome) => variaveis.has(nome) });
  });

  it('cria e audita; o saldo atual começa no inicial', async () => {
    const id = await salvar.criar(ator, dados());

    expect(await consultar.obter(id)).toMatchObject({
      apelido: 'Itaú cobrança',
      empresaNome: 'TeleImagem',
      saldoAtualCentavos: 100_00,
      variaveisCredencial: [],
    });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        entidade: 'conta_bancaria',
        entidadeId: id,
        acao: 'criado',
        depois: expect.objectContaining({ apelido: 'Itaú cobrança', saldoInicialCentavos: 100_00 }),
      }),
    ]);
  });

  it('recusa empresa que não usa o financeiro do One', async () => {
    await expect(salvar.criar(ator, dados({ contratadoId: 'rn' }))).rejects.toBeInstanceOf(
      DadosInvalidosError,
    );
  });

  it('o apelido não se repete na mesma empresa', async () => {
    await salvar.criar(ator, dados());
    await expect(salvar.criar(ator, dados({ apelido: 'ITAÚ COBRANÇA' }))).rejects.toBeInstanceOf(
      DadoEmUsoError,
    );
  });

  it('marcar uma conta como padrão para recebimento desmarca a anterior da empresa, com auditoria', async () => {
    const primeira = await salvar.criar(ator, dados({ padraoRecebimento: true }));
    const segunda = await salvar.criar(
      ator,
      dados({ apelido: 'Movimento', padraoRecebimento: true }),
    );

    expect((await consultar.obter(primeira)).padraoRecebimento).toBe(false);
    expect((await consultar.obter(segunda)).padraoRecebimento).toBe(true);
    expect(auditoria.eventos.find((e) => e.acao === 'alterado')).toMatchObject({
      entidadeId: primeira,
      antes: { padraoRecebimento: true },
      depois: { padraoRecebimento: false },
    });
  });

  it('diz quais variáveis da credencial existem no servidor, sem o valor', async () => {
    variaveis.add('ITAU_TELE_CLIENT_ID');
    const id = await salvar.criar(ator, dados({ integracao: 'itau', credencial: 'ITAU_TELE' }));

    expect((await consultar.obter(id)).variaveisCredencial).toEqual([
      { nome: 'ITAU_TELE_CLIENT_ID', configurada: true },
      { nome: 'ITAU_TELE_CLIENT_SECRET', configurada: false },
      { nome: 'ITAU_TELE_CERTIFICADO', configurada: false },
    ]);
  });

  it('editar audita só o que mudou', async () => {
    const id = await salvar.criar(ator, dados());
    auditoria.eventos.length = 0;

    await salvar.atualizar(ator, id, dados({ saldoInicialCentavos: 200_00 }));

    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        acao: 'alterado',
        antes: { saldoInicialCentavos: 100_00 },
        depois: { saldoInicialCentavos: 200_00 },
      }),
    ]);
  });

  it('exclui e audita; em uso, recusa; inexistente, não encontrado', async () => {
    const excluir = new ExcluirContaBancaria(repo, auditoria, relogio);
    const usada = await salvar.criar(ator, dados());
    const livre = await salvar.criar(ator, dados({ apelido: 'Caixa', tipo: 'caixa' }));
    repo.usadas.add(usada);

    await expect(excluir.executar(ator, usada)).rejects.toBeInstanceOf(EmUsoError);
    await excluir.executar(ator, livre);
    expect(await repo.buscar(livre)).toBeNull();
    expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'excluido', entidadeId: livre });
    await expect(excluir.executar(ator, 'x')).rejects.toBeInstanceOf(NaoEncontradoError);
  });
});
