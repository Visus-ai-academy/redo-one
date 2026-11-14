import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemEmUsoError, ItemNaoEncontradoError, NomeEmUsoError } from '../comum/catalogo.errors';
import { InMemoryListaRepository } from '../testing/fakes';
import { ListaService } from './listas.service';

const AGORA = new Date('2026-11-14T12:00:00Z');
const ator = { usuarioId: 'u-ana' };
const MODALIDADE = { entidade: 'modalidade', singular: 'Modalidade', genero: 'f' } as const;

const dados = (nome: string, extra: Partial<{ ordem: number; ativo: boolean }> = {}) => ({
  nome,
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  ...extra,
});

describe('ListaService', () => {
  let repo: InMemoryListaRepository;
  let auditoria: InMemoryAuditoria;
  let service: ListaService;

  beforeEach(() => {
    repo = new InMemoryListaRepository();
    auditoria = new InMemoryAuditoria();
    service = new ListaService(MODALIDADE, repo, auditoria, new FixedClock(AGORA));
  });

  it('cria com o nome aparado e registra a auditoria', async () => {
    const id = await service.criar(ator, { ...dados('  MR  '), descricao: '  Ressonância ' });

    expect(await service.obter(id)).toMatchObject({ nome: 'MR', descricao: 'Ressonância' });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'usuario', id: 'u-ana' },
        entidade: 'modalidade',
        entidadeId: id,
        acao: 'criado',
        em: AGORA,
      }),
    ]);
  });

  it('recusa nome repetido sem diferenciar maiúsculas', async () => {
    await service.criar(ator, dados('MR'));

    await expect(service.criar(ator, dados('mr'))).rejects.toThrow(NomeEmUsoError);
    await expect(service.criar(ator, dados('mr'))).rejects.toThrow(
      'Já existe uma modalidade chamada "mr".',
    );
  });

  it('permite salvar o item com o próprio nome', async () => {
    const id = await service.criar(ator, dados('MR'));

    await service.atualizar(ator, id, dados('MR', { ordem: 3 }));

    expect((await service.obter(id)).ordem).toBe(3);
  });

  it('audita na edição só os campos que mudaram', async () => {
    const id = await service.criar(ator, dados('MR'));

    await service.atualizar(ator, id, dados('MR', { ordem: 3, ativo: false }));

    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { ordem: 0, ativo: true },
      depois: { ordem: 3, ativo: false },
    });
  });

  it('não audita edição sem mudança', async () => {
    const id = await service.criar(ator, dados('MR'));

    await service.atualizar(ator, id, dados('MR'));

    expect(auditoria.eventos).toHaveLength(1);
  });

  it('avisa quando o item não existe', async () => {
    await expect(service.obter('nao-existe')).rejects.toThrow(ItemNaoEncontradoError);
    await expect(service.obter('nao-existe')).rejects.toThrow('Modalidade não encontrada.');
  });

  it('exclui e audita', async () => {
    const id = await service.criar(ator, dados('MR'));

    await service.excluir(ator, id);

    await expect(service.obter(id)).rejects.toThrow(ItemNaoEncontradoError);
    expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'excluido', antes: { nome: 'MR' } });
  });

  it('não exclui item em uso: pede para desativar', async () => {
    const id = await service.criar(ator, dados('MR'));
    repo.emUso.add(id);

    await expect(service.excluir(ator, id)).rejects.toThrow(ItemEmUsoError);
    await expect(service.excluir(ator, id)).rejects.toThrow(
      'A modalidade está em uso. Desative-a em vez de excluir.',
    );
  });

  it('lista paginado, por ordem e nome, com busca e filtro de ativo', async () => {
    await service.criar(ator, dados('RX', { ordem: 2 }));
    await service.criar(ator, dados('CT', { ordem: 1 }));
    await service.criar(ator, dados('MR', { ordem: 1, ativo: false }));

    const todos = await service.listar({ pagina: 1, porPagina: 2 });
    expect(todos.total).toBe(3);
    expect(todos.itens.map((i) => i.nome)).toEqual(['CT', 'MR']);

    const ativos = await service.listar({ ativo: true, pagina: 1, porPagina: 10 });
    expect(ativos.itens.map((i) => i.nome)).toEqual(['CT', 'RX']);

    const busca = await service.listar({ busca: 'r', pagina: 1, porPagina: 10 });
    expect(busca.itens.map((i) => i.nome)).toEqual(['MR', 'RX']);
  });
});
