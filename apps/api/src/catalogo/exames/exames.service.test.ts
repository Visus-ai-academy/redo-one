import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { InMemoryExamesRepository } from '../testing/fakes';
import { RegraQuebraInvalidaError } from './exames.errors';
import type { DadosExame } from './exames.repository';
import { ExamesService } from './exames.service';

const ator = { usuarioId: 'u-ana' };
const dados = (nome: string, extra: Partial<DadosExame> = {}): DadosExame => ({
  nome,
  codigo: null,
  descricao: null,
  modalidadeId: null,
  especialidadeId: null,
  subespecialidadeId: null,
  categoriaId: null,
  prioridadeId: null,
  permiteQuebra: false,
  exigeRevisaoManual: false,
  ativo: true,
  ...extra,
});

describe('ExamesService', () => {
  let repo: InMemoryExamesRepository;
  let auditoria: InMemoryAuditoria;
  let service: ExamesService;

  beforeEach(() => {
    repo = new InMemoryExamesRepository();
    auditoria = new InMemoryAuditoria();
    service = new ExamesService(repo, auditoria, new FixedClock(new Date('2026-11-14T12:00:00Z')));
  });

  it('cria com a chave normalizada do nome, aceita homônimos e audita', async () => {
    const id = await service.criar(ator, dados(' RM CRÂNIO '));
    await service.criar(ator, dados('RM CRÂNIO'));

    expect(repo.itens.get(id)).toMatchObject({ nome: 'RM CRÂNIO', chaveNormalizada: 'rm cranio' });
    expect(repo.itens.size).toBe(2);
    expect(auditoria.eventos[0]).toMatchObject({ entidade: 'exame', acao: 'criado' });
  });

  it('audita só o que mudou na edição', async () => {
    const id = await service.criar(ator, dados('RX TORAX'));

    await service.atualizar(ator, id, dados('RX TORAX', { exigeRevisaoManual: true }));

    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { exigeRevisaoManual: false },
      depois: { exigeRevisaoManual: true },
    });
  });

  describe('regras de quebra', () => {
    it('liga o exame de origem ao de destino e audita no exame de origem', async () => {
      const origem = await service.criar(ator, dados('TC TORAX E ABDOME'));
      const destino = await service.criar(ator, dados('TC ABDOME'));

      await service.criarRegraQuebra(ator, origem, {
        exameDestinoId: destino,
        categoriaId: null,
        ativo: true,
      });

      expect((await service.obter(origem)).regrasQuebra).toEqual([
        expect.objectContaining({ exameDestino: { id: destino, nome: 'TC ABDOME' }, ativo: true }),
      ]);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        entidadeId: origem,
        acao: 'regra_quebra_criada',
        depois: { exameDestino: 'TC ABDOME' },
      });
    });

    it('não quebra o exame nele mesmo, nem repete o destino', async () => {
      const origem = await service.criar(ator, dados('TC TORAX E ABDOME'));
      const destino = await service.criar(ator, dados('TC ABDOME'));
      await service.criarRegraQuebra(ator, origem, {
        exameDestinoId: destino,
        categoriaId: null,
        ativo: true,
      });

      await expect(
        service.criarRegraQuebra(ator, origem, {
          exameDestinoId: origem,
          categoriaId: null,
          ativo: true,
        }),
      ).rejects.toThrow(RegraQuebraInvalidaError);
      await expect(
        service.criarRegraQuebra(ator, origem, {
          exameDestinoId: destino,
          categoriaId: null,
          ativo: true,
        }),
      ).rejects.toThrow('Este exame já se quebra em TC ABDOME.');
    });

    it('recusa destino inexistente', async () => {
      const origem = await service.criar(ator, dados('TC TORAX E ABDOME'));

      await expect(
        service.criarRegraQuebra(ator, origem, {
          exameDestinoId: 'nao-existe',
          categoriaId: null,
          ativo: true,
        }),
      ).rejects.toThrow('Exame de destino não encontrado.');
    });

    it('edita e exclui só regra do exame da rota', async () => {
      const origem = await service.criar(ator, dados('TC TORAX E ABDOME'));
      const outro = await service.criar(ator, dados('OUTRO'));
      const destino = await service.criar(ator, dados('TC ABDOME'));
      const regra = await service.criarRegraQuebra(ator, origem, {
        exameDestinoId: destino,
        categoriaId: null,
        ativo: true,
      });

      await expect(service.excluirRegraQuebra(ator, outro, regra)).rejects.toThrow(
        ItemNaoEncontradoError,
      );
      await service.atualizarRegraQuebra(ator, origem, regra, {
        exameDestinoId: destino,
        categoriaId: null,
        ativo: false,
      });
      expect((await service.obter(origem)).regrasQuebra[0]?.ativo).toBe(false);

      await service.excluirRegraQuebra(ator, origem, regra);
      expect((await service.obter(origem)).regrasQuebra).toEqual([]);
      expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'regra_quebra_excluida' });
    });
  });
});
