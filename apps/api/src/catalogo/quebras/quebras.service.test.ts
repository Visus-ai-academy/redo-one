import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { InMemoryQuebrasRepository } from '../testing/fakes';
import { QuebraInvalidaError, QuebraRepetidaError } from './quebras.errors';
import { QuebrasService } from './quebras.service';

const ator = { usuarioId: 'u-ana' };
const peca = (exameId: string) => ({ exameId, categoriaId: null, ativo: true });

describe('QuebrasService', () => {
  let repo: InMemoryQuebrasRepository;
  let auditoria: InMemoryAuditoria;
  let service: QuebrasService;
  let torax: string;
  let abdome: string;

  beforeEach(() => {
    repo = new InMemoryQuebrasRepository();
    auditoria = new InMemoryAuditoria();
    service = new QuebrasService(repo, auditoria, new FixedClock(new Date('2026-11-15T12:00:00Z')));
    torax = repo.exame('TC TÓRAX');
    abdome = repo.exame('TC ABDOME');
  });

  it('cria a quebra pelo nome do estudo como chega, com a chave normalizada, e audita', async () => {
    const id = await service.criar(ator, { estudoOrigem: ' TC TÓRAX E ABDOME X2 ' });

    expect(await service.obter(id)).toMatchObject({
      estudoOrigem: 'TC TÓRAX E ABDOME X2',
      chaveNormalizada: 'tc torax e abdome x2',
      pecas: [],
    });
    expect(auditoria.eventos[0]).toMatchObject({
      entidade: 'quebra_estudo',
      acao: 'criado',
      depois: { estudoOrigem: 'TC TÓRAX E ABDOME X2' },
    });
  });

  it('não repete o estudo (mesma grafia normalizada) nem aceita nome vazio', async () => {
    await service.criar(ator, { estudoOrigem: 'TC TÓRAX E ABDOME' });

    await expect(service.criar(ator, { estudoOrigem: 'tc torax e abdome' })).rejects.toThrow(
      new QuebraRepetidaError('Já existe uma quebra para "TC TÓRAX E ABDOME".'),
    );
    await expect(service.criar(ator, { estudoOrigem: '  ' })).rejects.toThrow(QuebraInvalidaError);
  });

  it('renomeia o estudo, sem colidir com outra quebra', async () => {
    const id = await service.criar(ator, { estudoOrigem: 'TC TORAX E ABDOME' });
    await service.criar(ator, { estudoOrigem: 'RM CRANIO E SELA' });

    await service.atualizar(ator, id, { estudoOrigem: 'TC TORAX E ABDOME X2' });
    await expect(service.atualizar(ator, id, { estudoOrigem: 'RM CRÂNIO E SELA' })).rejects.toThrow(
      QuebraRepetidaError,
    );
    expect((await service.obter(id)).estudoOrigem).toBe('TC TORAX E ABDOME X2');
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { estudoOrigem: 'TC TORAX E ABDOME' },
      depois: { estudoOrigem: 'TC TORAX E ABDOME X2' },
    });
  });

  describe('peças', () => {
    it('adiciona, altera e remove, auditando na quebra', async () => {
      const id = await service.criar(ator, { estudoOrigem: 'TC TORAX E ABDOME' });

      const pecaId = await service.adicionarPeca(ator, id, peca(torax));
      await service.adicionarPeca(ator, id, peca(abdome));
      expect((await service.obter(id)).pecas.map((p) => p.exame.nome)).toEqual([
        'TC ABDOME',
        'TC TÓRAX',
      ]);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        entidade: 'quebra_estudo',
        entidadeId: id,
        acao: 'peca_adicionada',
        depois: { exame: 'TC ABDOME', categoria: null, ativo: true },
      });

      await service.atualizarPeca(ator, id, pecaId, { ...peca(torax), ativo: false });
      expect(auditoria.eventos.at(-1)).toMatchObject({
        acao: 'peca_alterada',
        antes: { ativo: true },
        depois: { ativo: false },
      });

      await service.removerPeca(ator, id, pecaId);
      expect((await service.obter(id)).pecas).toHaveLength(1);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        acao: 'peca_removida',
        antes: { exame: 'TC TÓRAX' },
      });
    });

    it('não repete o exame, não quebra o estudo nele mesmo e recusa exame inexistente', async () => {
      const id = await service.criar(ator, { estudoOrigem: 'TC TORAX E ABDOME' });
      await service.adicionarPeca(ator, id, peca(abdome));
      const proprio = repo.exame('TC TORAX E ABDOME');

      await expect(service.adicionarPeca(ator, id, peca(abdome))).rejects.toThrow(
        new QuebraRepetidaError('Este estudo já se quebra em TC ABDOME.'),
      );
      await expect(service.adicionarPeca(ator, id, peca(proprio))).rejects.toThrow(
        new QuebraInvalidaError('O estudo não pode se quebrar nele mesmo.'),
      );
      await expect(service.adicionarPeca(ator, id, peca('nao-existe'))).rejects.toThrow(
        new QuebraInvalidaError('Exame não encontrado.'),
      );
    });

    it('a peça precisa ser da quebra da rota', async () => {
      const id = await service.criar(ator, { estudoOrigem: 'TC TORAX E ABDOME' });
      const outra = await service.criar(ator, { estudoOrigem: 'RM CRANIO E SELA' });
      const pecaId = await service.adicionarPeca(ator, id, peca(abdome));

      await expect(service.removerPeca(ator, outra, pecaId)).rejects.toThrow(
        ItemNaoEncontradoError,
      );
    });
  });

  it('exclui a quebra com as peças e audita o que havia', async () => {
    const id = await service.criar(ator, { estudoOrigem: 'TC TORAX E ABDOME' });
    await service.adicionarPeca(ator, id, peca(abdome));

    await service.excluir(ator, id);

    await expect(service.obter(id)).rejects.toThrow(ItemNaoEncontradoError);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'excluido',
      antes: { estudoOrigem: 'TC TORAX E ABDOME', pecas: ['TC ABDOME'] },
    });
  });
});
