import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemNaoEncontradoError, SegmentoForaDaEspecialidadeError } from '../comum/catalogo.errors';
import { InMemoryExamesRepository } from '../testing/fakes';
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
    repo.segmentosCadastrados.push(
      { id: 's-cabeca', nome: 'CABEÇA', especialidadeIds: ['e-neuro'] },
      { id: 's-pescoco', nome: 'PESCOÇO', especialidadeIds: ['e-neuro'] },
      { id: 's-colunas', nome: 'COLUNAS', especialidadeIds: ['e-neuro', 'e-msk'] },
    );
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

  describe('segmento da especialidade', () => {
    it('recusa criar com segmento de outra especialidade ou sem especialidade', async () => {
      await expect(
        service.criar(
          ator,
          dados('RM JOELHO', { especialidadeId: 'e-msk', subespecialidadeId: 's-cabeca' }),
        ),
      ).rejects.toThrow(SegmentoForaDaEspecialidadeError);
      await expect(
        service.criar(ator, dados('RM JOELHO', { subespecialidadeId: 's-cabeca' })),
      ).rejects.toThrow(SegmentoForaDaEspecialidadeError);
      expect(repo.itens.size).toBe(0);
    });

    it('aceita segmento que é de várias especialidades', async () => {
      const id = await service.criar(
        ator,
        dados('RM COLUNA', { especialidadeId: 'e-msk', subespecialidadeId: 's-colunas' }),
      );
      expect(repo.itens.get(id)?.subespecialidadeId).toBe('s-colunas');
    });

    it('recusa trocar a especialidade deixando um segmento que ela não tem', async () => {
      const id = await service.criar(
        ator,
        dados('RM CRANIO', { especialidadeId: 'e-neuro', subespecialidadeId: 's-cabeca' }),
      );
      await expect(
        service.atualizar(
          ator,
          id,
          dados('RM CRANIO', { especialidadeId: 'e-msk', subespecialidadeId: 's-cabeca' }),
        ),
      ).rejects.toThrow(SegmentoForaDaEspecialidadeError);
    });

    it('não barra a edição de outros campos de um exame já gravado fora da regra', async () => {
      const id = await service.criar(ator, dados('RM CRANIO', { especialidadeId: 'e-neuro' }));
      // Gravado antes da regra (ou o segmento perdeu a especialidade depois).
      await repo.definirSubespecialidade(id, 's-sem-neuro');
      repo.segmentosCadastrados.push({ id: 's-sem-neuro', nome: 'X', especialidadeIds: ['e-msk'] });

      await service.atualizar(
        ator,
        id,
        dados('RM CRÂNIO', { especialidadeId: 'e-neuro', subespecialidadeId: 's-sem-neuro' }),
      );

      expect(repo.itens.get(id)?.nome).toBe('RM CRÂNIO');
    });
  });

  describe('só a subespecialidade', () => {
    it('muda só a subespecialidade e audita só ela', async () => {
      const id = await service.criar(
        ator,
        dados('RM CRANIO', { especialidadeId: 'e-neuro', subespecialidadeId: 's-cabeca' }),
      );

      await service.definirSubespecialidade(ator, id, 's-pescoco');

      expect(repo.itens.get(id)).toMatchObject({
        nome: 'RM CRANIO',
        especialidadeId: 'e-neuro',
        subespecialidadeId: 's-pescoco',
      });
      expect(auditoria.eventos.at(-1)).toMatchObject({
        entidade: 'exame',
        entidadeId: id,
        acao: 'alterado',
        antes: { subespecialidadeId: 's-cabeca' },
        depois: { subespecialidadeId: 's-pescoco' },
      });
    });

    it('aceita tirar a subespecialidade; sem mudança, não audita', async () => {
      const id = await service.criar(
        ator,
        dados('RM CRANIO', { especialidadeId: 'e-neuro', subespecialidadeId: 's-cabeca' }),
      );
      await service.definirSubespecialidade(ator, id, null);
      expect(repo.itens.get(id)?.subespecialidadeId).toBeNull();
      const eventos = auditoria.eventos.length;

      await service.definirSubespecialidade(ator, id, null);

      expect(auditoria.eventos).toHaveLength(eventos);
    });

    it('recusa segmento que a especialidade do exame não tem', async () => {
      const id = await service.criar(ator, dados('RM JOELHO', { especialidadeId: 'e-msk' }));

      await service.definirSubespecialidade(ator, id, 's-colunas');
      await expect(service.definirSubespecialidade(ator, id, 's-cabeca')).rejects.toThrow(
        'O segmento CABEÇA não existe na especialidade do exame.',
      );
      expect(repo.itens.get(id)?.subespecialidadeId).toBe('s-colunas');
    });

    it('exame inexistente dá erro de não encontrado', async () => {
      await expect(service.definirSubespecialidade(ator, 'x', null)).rejects.toThrow(
        ItemNaoEncontradoError,
      );
    });
  });
});
