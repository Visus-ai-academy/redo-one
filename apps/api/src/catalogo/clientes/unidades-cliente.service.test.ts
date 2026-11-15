import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { InMemoryClientesRepository, InMemoryContratadosRepository } from '../testing/fakes';
import { UnificacaoEmUsoError, UnificacaoInvalidaError } from './clientes.errors';
import { UnidadesClienteService } from './unidades-cliente.service';

const ator = { usuarioId: 'u-ana' };

describe('UnidadesClienteService', () => {
  let repo: InMemoryClientesRepository;
  let auditoria: InMemoryAuditoria;
  let service: UnidadesClienteService;
  let prn: string;
  let araraquara: string;
  let camboriu: string;
  let cedi: string;

  const cliente = (nome: string) =>
    repo.criar({
      nome,
      chaveNormalizada: nome.toLowerCase(),
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
    araraquara = await cliente('PRN TELE_ARARAQUARA');
    camboriu = await cliente('PRN TELE_HOSPITAL CAMBORIU');
    cedi = await cliente('CEDIDIAG');
    auditoria = new InMemoryAuditoria();
    service = new UnidadesClienteService(
      repo,
      auditoria,
      new FixedClock(new Date('2026-11-14T12:00:00Z')),
    );
  });

  it('unifica a unidade no cliente principal e audita nos dois', async () => {
    await service.adicionar(ator, prn, araraquara);

    const principal = await repo.buscar(prn);
    expect(principal?.unidades).toEqual([{ id: araraquara, nome: 'PRN TELE_ARARAQUARA' }]);
    expect((await repo.buscar(araraquara))?.unificadoEm).toEqual({ id: prn, nome: 'PRN' });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        entidadeId: prn,
        acao: 'unidade_adicionada',
        depois: { unidade: 'PRN TELE_ARARAQUARA' },
      }),
      expect.objectContaining({
        entidadeId: araraquara,
        acao: 'unificado_em',
        depois: { principal: 'PRN' },
      }),
    ]);
  });

  it('desfaz: a unidade volta a ser um cliente independente', async () => {
    await service.adicionar(ator, prn, araraquara);

    await service.remover(ator, prn, araraquara);

    expect((await repo.buscar(araraquara))?.unificadoEm).toBeNull();
    expect((await repo.buscar(prn))?.unidades).toEqual([]);
    expect(auditoria.eventos.slice(2)).toEqual([
      expect.objectContaining({
        entidadeId: prn,
        acao: 'unidade_removida',
        antes: { unidade: 'PRN TELE_ARARAQUARA' },
      }),
      expect.objectContaining({
        entidadeId: araraquara,
        acao: 'unificacao_desfeita',
        antes: { principal: 'PRN' },
      }),
    ]);
  });

  it('recusa unificar o cliente nele mesmo', async () => {
    await expect(service.adicionar(ator, prn, prn)).rejects.toThrow(
      new UnificacaoInvalidaError('Um cliente não pode ser unidade dele mesmo.'),
    );
  });

  it('recusa usar uma unidade como principal: aponta o principal dela', async () => {
    await service.adicionar(ator, prn, araraquara);

    await expect(service.adicionar(ator, araraquara, camboriu)).rejects.toThrow(
      new UnificacaoInvalidaError(
        'PRN TELE_ARARAQUARA já é unidade de PRN: unifique no cliente principal.',
      ),
    );
  });

  it('recusa transformar em unidade um cliente que tem unidades próprias', async () => {
    await service.adicionar(ator, prn, araraquara);

    await expect(service.adicionar(ator, cedi, prn)).rejects.toThrow(
      new UnificacaoInvalidaError('PRN tem unidades próprias: desfaça essas unificações antes.'),
    );
  });

  it('recusa a unidade que já é de outro principal, dizendo qual', async () => {
    await service.adicionar(ator, prn, araraquara);

    await expect(service.adicionar(ator, cedi, araraquara)).rejects.toThrow(
      new UnificacaoEmUsoError('PRN TELE_ARARAQUARA já é unidade de PRN.'),
    );
    await expect(service.adicionar(ator, prn, araraquara)).rejects.toThrow(
      new UnificacaoEmUsoError('Esse cliente já é unidade deste.'),
    );
  });

  it('cliente inexistente ou unidade de outro principal não se desfaz', async () => {
    await expect(service.adicionar(ator, prn, 'nao-existe')).rejects.toThrow(
      ItemNaoEncontradoError,
    );
    await expect(service.remover(ator, prn, camboriu)).rejects.toThrow(ItemNaoEncontradoError);
  });
});
