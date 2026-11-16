import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import {
  ItemEmUsoError,
  ItemNaoEncontradoError,
  NomeEmUsoError,
  ReferenciaInexistenteError,
} from '../../catalogo/comum/catalogo.errors';
import { FixedClock } from '../../identidade/testing/fakes';
import { ConflitoEscalaError, EscalaInvalidaError } from '../domain/errors';
import { type EntradaFrente, FrentesService } from './frentes.service';
import { InMemoryFrentesRepository } from './testing';

const AGORA = new Date('2026-11-16T12:00:00Z');
const ator = { usuarioId: 'u-ana' };

const deEspecialidade = (especialidadeId: string, extra: Partial<EntradaFrente> = {}) => ({
  tipo: 'especialidade' as const,
  especialidadeId,
  modalidadeId: null,
  rotulo: null,
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  ...extra,
});

describe('FrentesService', () => {
  let repo: InMemoryFrentesRepository;
  let auditoria: InMemoryAuditoria;
  let service: FrentesService;

  beforeEach(() => {
    repo = new InMemoryFrentesRepository();
    repo.catalogo.set('esp-neuro', { tipo: 'especialidade', nome: 'NEURO' });
    repo.catalogo.set('esp-msk', { tipo: 'especialidade', nome: 'MUSCULOESQUELETICO' });
    repo.catalogo.set('mod-ct', { tipo: 'modalidade', nome: 'CT' });
    auditoria = new InMemoryAuditoria();
    service = new FrentesService(repo, auditoria, new FixedClock(AGORA));
  });

  it('sem rótulo, usa o nome do catálogo; devolve o nome do destino', async () => {
    const id = await service.criar(ator, deEspecialidade('esp-neuro'));

    expect(await service.obter(id)).toMatchObject({
      tipo: 'especialidade',
      especialidadeId: 'esp-neuro',
      modalidadeId: null,
      rotulo: 'NEURO',
      destinoNome: 'NEURO',
    });
  });

  it('frente de modalidade usa o código da modalidade como rótulo padrão', async () => {
    const id = await service.criar(ator, {
      ...deEspecialidade(''),
      tipo: 'modalidade',
      especialidadeId: null,
      modalidadeId: 'mod-ct',
    });

    expect(await service.obter(id)).toMatchObject({ rotulo: 'CT', destinoNome: 'CT' });
  });

  it('apara rótulo, descrição e cor e audita a criação como frente_escala', async () => {
    const id = await service.criar(
      ator,
      deEspecialidade('esp-msk', { rotulo: '  MSK ', descricao: '  ', cor: ' #1F7A4D ' }),
    );

    expect(await service.obter(id)).toMatchObject({
      rotulo: 'MSK',
      descricao: null,
      cor: '#1F7A4D',
    });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'usuario', id: 'u-ana' },
        entidade: 'frente_escala',
        entidadeId: id,
        acao: 'criado',
        depois: expect.objectContaining({ rotulo: 'MSK', especialidadeId: 'esp-msk' }),
        em: AGORA,
      }),
    ]);
  });

  it('recusa destino que não bate com o tipo', async () => {
    await expect(
      service.criar(ator, deEspecialidade('esp-neuro', { modalidadeId: 'mod-ct' })),
    ).rejects.toThrow(EscalaInvalidaError);
  });

  it('recusa destino que não existe no catálogo (ou é do outro tipo)', async () => {
    await expect(service.criar(ator, deEspecialidade('nao-existe'))).rejects.toThrow(
      ReferenciaInexistenteError,
    );
    await expect(service.criar(ator, deEspecialidade('mod-ct'))).rejects.toThrow(
      ReferenciaInexistenteError,
    );
  });

  it('uma frente por especialidade ou modalidade', async () => {
    await service.criar(ator, deEspecialidade('esp-neuro'));

    const repetida = service.criar(ator, deEspecialidade('esp-neuro', { rotulo: 'NEURO 2' }));
    await expect(repetida).rejects.toThrow(ConflitoEscalaError);
    await expect(
      service.criar(ator, deEspecialidade('esp-neuro', { rotulo: 'NEURO 2' })),
    ).rejects.toThrow('Já existe a frente "NEURO" para a especialidade NEURO.');
  });

  it('rótulo único, sem diferenciar maiúsculas', async () => {
    await service.criar(ator, deEspecialidade('esp-neuro', { rotulo: 'NEURO' }));

    await expect(
      service.criar(ator, deEspecialidade('esp-msk', { rotulo: 'neuro' })),
    ).rejects.toThrow(NomeEmUsoError);
    await expect(
      service.criar(ator, deEspecialidade('esp-msk', { rotulo: 'neuro' })),
    ).rejects.toThrow('Já existe uma frente chamada "neuro".');
  });

  it('edita a própria frente sem acusar rótulo ou destino repetido; audita só o que mudou', async () => {
    const id = await service.criar(ator, deEspecialidade('esp-neuro'));

    await service.atualizar(ator, id, deEspecialidade('esp-neuro', { rotulo: 'NEURO', ordem: 3 }));

    expect((await service.obter(id)).ordem).toBe(3);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { ordem: 0 },
      depois: { ordem: 3 },
    });
  });

  it('avisa quando a frente não existe', async () => {
    await expect(service.obter('x')).rejects.toThrow(ItemNaoEncontradoError);
    await expect(service.obter('x')).rejects.toThrow('Frente não encontrada.');
    await expect(service.atualizar(ator, 'x', deEspecialidade('esp-neuro'))).rejects.toThrow(
      ItemNaoEncontradoError,
    );
  });

  it('exclui e audita', async () => {
    const id = await service.criar(ator, deEspecialidade('esp-neuro'));

    await service.excluir(ator, id);

    await expect(service.obter(id)).rejects.toThrow(ItemNaoEncontradoError);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'excluido',
      antes: { rotulo: 'NEURO' },
    });
  });

  it('não exclui frente em uso: pede para desativar', async () => {
    const id = await service.criar(ator, deEspecialidade('esp-neuro'));
    repo.emUso.add(id);

    await expect(service.excluir(ator, id)).rejects.toThrow(ItemEmUsoError);
    await expect(service.excluir(ator, id)).rejects.toThrow(
      'A frente está em uso. Desative-a em vez de excluir.',
    );
  });

  it('lista paginado por ordem e rótulo, com busca e filtro de ativo', async () => {
    await service.criar(ator, deEspecialidade('esp-neuro', { ordem: 2 }));
    await service.criar(ator, deEspecialidade('esp-msk', { rotulo: 'MSK', ordem: 1 }));
    await service.criar(ator, {
      ...deEspecialidade(''),
      tipo: 'modalidade',
      especialidadeId: null,
      modalidadeId: 'mod-ct',
      ordem: 1,
      ativo: false,
    });

    const pagina = await service.listar({ pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((f) => f.rotulo)).toEqual(['CT', 'MSK']);
    const ativas = await service.listar({ ativo: true, pagina: 1, porPagina: 10 });
    expect(ativas.itens.map((f) => f.rotulo)).toEqual(['MSK', 'NEURO']);
    const busca = await service.listar({ busca: 'neu', pagina: 1, porPagina: 10 });
    expect(busca.itens.map((f) => f.rotulo)).toEqual(['NEURO']);
  });

  it('recusa trocar o destino de uma frente em uso', async () => {
    const id = await service.criar(ator, deEspecialidade('esp-neuro'));
    repo.emUso.add(id);

    const trocar = () => service.atualizar(ator, id, deEspecialidade('esp-msk'));
    await expect(trocar()).rejects.toThrow(ConflitoEscalaError);
    await expect(trocar()).rejects.toThrow(
      'A frente está em uso (turno, alocação, ausência ou recorte de gestora): não dá para trocar a especialidade ou modalidade dela. Crie outra frente e desative esta.',
    );
    await expect(
      service.atualizar(ator, id, {
        ...deEspecialidade(''),
        tipo: 'modalidade',
        especialidadeId: null,
        modalidadeId: 'mod-ct',
      }),
    ).rejects.toThrow(ConflitoEscalaError);
    expect((await service.obter(id)).especialidadeId).toBe('esp-neuro');
  });

  it('na frente em uso, rótulo, cor, ordem e ativo continuam editáveis', async () => {
    const id = await service.criar(ator, deEspecialidade('esp-neuro'));
    repo.emUso.add(id);

    await service.atualizar(
      ator,
      id,
      deEspecialidade('esp-neuro', { rotulo: 'NEURO 1', cor: '#123456', ordem: 5, ativo: false }),
    );

    expect(await service.obter(id)).toMatchObject({
      rotulo: 'NEURO 1',
      cor: '#123456',
      ordem: 5,
      ativo: false,
    });
  });

  it('frente livre pode trocar de destino', async () => {
    const id = await service.criar(ator, deEspecialidade('esp-neuro'));

    await service.atualizar(ator, id, deEspecialidade('esp-msk'));

    expect((await service.obter(id)).especialidadeId).toBe('esp-msk');
  });
});
