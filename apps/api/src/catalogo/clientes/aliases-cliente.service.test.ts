import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { InMemoryClientesRepository, InMemoryContratadosRepository } from '../testing/fakes';
import { AliasesClienteService } from './aliases-cliente.service';
import { AliasEmUsoError, AliasInvalidoError } from './clientes.errors';

const ator = { usuarioId: 'u-ana' };

describe('AliasesClienteService', () => {
  let repo: InMemoryClientesRepository;
  let auditoria: InMemoryAuditoria;
  let service: AliasesClienteService;
  let prn: string;
  let cedi: string;

  const cliente = (nome: string) =>
    repo.criar({
      nome,
      chaveNormalizada: nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
      nomeFantasia: null,
      razaoSocial: null,
      tipoPessoa: 'PJ',
      cnpj: null,
      cpf: null,
      contratadoId: null,
      ativo: true,
      ocultoDashboards: false,
      observacoes: null,
    });

  beforeEach(async () => {
    repo = new InMemoryClientesRepository(new InMemoryContratadosRepository());
    prn = await cliente('PRN');
    cedi = await cliente('CEDIDIAG');
    auditoria = new InMemoryAuditoria();
    service = new AliasesClienteService(
      repo,
      repo,
      auditoria,
      new FixedClock(new Date('2026-11-14T12:00:00Z')),
    );
  });

  it('guarda a chave que a importação compara: maiúsculas no exato e no prefixo', async () => {
    await service.criar(ator, prn, { tipo: 'prefixo', padrao: ' prn tele_ ', observacoes: null });

    expect(repo.aliases[0]).toMatchObject({
      tipo: 'prefixo',
      padrao: 'prn tele_',
      chave: 'PRN TELE_',
    });
    expect(auditoria.eventos[0]).toMatchObject({
      entidade: 'cliente',
      entidadeId: prn,
      acao: 'alias_criado',
      depois: { tipo: 'prefixo', padrao: 'prn tele_' },
    });
  });

  it('no tipo normalizado, a chave é a grafia normalizada', async () => {
    await service.criar(ator, cedi, {
      tipo: 'normalizado',
      padrao: 'Cedi-Unimed',
      observacoes: null,
    });

    expect(repo.aliases[0]?.chave).toBe('cedi unimed');
  });

  it('recusa o mesmo padrão já ligado a outro cliente, dizendo qual', async () => {
    await service.criar(ator, prn, { tipo: 'exato', padrao: 'CEDI_RJ', observacoes: null });

    await expect(
      service.criar(ator, cedi, { tipo: 'exato', padrao: 'cedi_rj', observacoes: null }),
    ).rejects.toThrow('Esse apelido já está ligado a PRN.');
    await expect(
      service.criar(ator, prn, { tipo: 'exato', padrao: 'cedi_rj', observacoes: null }),
    ).rejects.toThrow(AliasEmUsoError);
  });

  it('normalizado igual ao nome do próprio cliente não precisa de apelido', async () => {
    await expect(
      service.criar(ator, prn, { tipo: 'normalizado', padrao: ' Prn. ', observacoes: null }),
    ).rejects.toThrow(AliasInvalidoError);
  });

  it('normalizado igual ao nome de outro cliente é recusado', async () => {
    await expect(
      service.criar(ator, prn, { tipo: 'normalizado', padrao: 'Cedidiag', observacoes: null }),
    ).rejects.toThrow('Essa grafia é o nome do cliente CEDIDIAG.');
  });

  it('exclui o apelido do cliente e audita; apelido de outro cliente não é achado', async () => {
    const id = await service.criar(ator, prn, { tipo: 'exato', padrao: 'PRN2', observacoes: null });

    await expect(service.excluir(ator, cedi, id)).rejects.toThrow(ItemNaoEncontradoError);
    await service.excluir(ator, prn, id);

    expect(repo.aliases).toEqual([]);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alias_excluido',
      antes: { padrao: 'PRN2' },
    });
  });

  it('cliente inexistente', async () => {
    await expect(
      service.criar(ator, 'nao-existe', { tipo: 'exato', padrao: 'X', observacoes: null }),
    ).rejects.toThrow('Cliente não encontrado.');
  });
});
