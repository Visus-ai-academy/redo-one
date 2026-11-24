import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { DADOS_FISCAIS_VAZIOS, DadosFiscaisInvalidosError } from '../../domain/dados-fiscais';
import { ClienteNaoEncontradoError } from '../../domain/vigencia-corte';
import { DadosFiscaisEmMemoria } from '../../testing/fakes';
import { DefinirDadosFiscais, ObterDadosFiscais } from './dados-fiscais';

const agora = new Date('2026-11-24T18:00:00Z');

describe('dados de faturamento do cliente', () => {
  let repo: DadosFiscaisEmMemoria;
  let auditoria: InMemoryAuditoria;
  let obter: ObterDadosFiscais;
  let definir: DefinirDadosFiscais;

  beforeEach(() => {
    repo = new DadosFiscaisEmMemoria();
    repo.clientes.add('c1');
    auditoria = new InMemoryAuditoria();
    obter = new ObterDadosFiscais(repo);
    definir = new DefinirDadosFiscais(repo, auditoria, () => agora);
  });

  it('cliente sem dados: tudo vazio, sem Omie', async () => {
    expect(await obter.executar('c1')).toEqual({
      dados: DADOS_FISCAIS_VAZIOS,
      omie: { codigoCliente: null, sincronizadoEm: null },
      atualizadoEm: null,
      atualizadoPor: null,
    });
  });

  it('cliente que não existe: 404 ao ler e ao gravar', async () => {
    await expect(obter.executar('x')).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
    await expect(definir.executar('u1', 'x', DADOS_FISCAIS_VAZIOS)).rejects.toBeInstanceOf(
      ClienteNaoEncontradoError,
    );
  });

  it('grava normalizado, em nome de quem salvou, e audita só o que mudou', async () => {
    await definir.executar('u1', 'c1', {
      ...DADOS_FISCAIS_VAZIOS,
      emailsNf: [' nf@cliente.com.br ', 'nf@cliente.com.br'],
      telefone: '(11) 3333-4444',
    });

    const lido = await obter.executar('c1');
    expect(lido.dados.emailsNf).toEqual(['nf@cliente.com.br']);
    expect(lido.atualizadoEm).toEqual(agora);
    expect(repo.autores).toEqual([{ usuarioId: 'u1', em: agora }]);
    expect(auditoria.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'cliente_dados_fiscais',
        entidadeId: 'c1',
        acao: 'alterado',
        antes: { emailsNf: [], telefone: null },
        depois: { emailsNf: ['nf@cliente.com.br'], telefone: '(11) 3333-4444' },
        em: agora,
      },
    ]);
  });

  it('salvar igual não grava nem audita', async () => {
    const dados = { ...DADOS_FISCAIS_VAZIOS, exclusaoFiscal: true };
    await definir.executar('u1', 'c1', dados);
    await definir.executar('u1', 'c1', dados);
    expect(repo.autores).toHaveLength(1);
    expect(auditoria.eventos).toHaveLength(1);
  });

  it('mantém o que veio do Omie ao salvar', async () => {
    repo.omie.set('c1', { codigoCliente: '8556006877', sincronizadoEm: agora });
    await definir.executar('u1', 'c1', { ...DADOS_FISCAIS_VAZIOS, email: 'a@b.com' });
    expect((await obter.executar('c1')).omie).toEqual({
      codigoCliente: '8556006877',
      sincronizadoEm: agora,
    });
  });

  it('dado inválido não grava nada', async () => {
    await expect(
      definir.executar('u1', 'c1', { ...DADOS_FISCAIS_VAZIOS, cidade: 'X' }),
    ).rejects.toBeInstanceOf(DadosFiscaisInvalidosError);
    expect(repo.autores).toEqual([]);
    expect(auditoria.eventos).toEqual([]);
  });
});
