import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
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
});
