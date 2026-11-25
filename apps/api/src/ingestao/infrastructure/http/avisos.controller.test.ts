import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { AtualizarParametros } from '../../application/use-cases/atualizar-parametros';
import type {
  ListarAvisos,
  ObterParametros,
  ResumoAvisosDoResponsavel,
  SelosDeAviso,
} from '../../application/use-cases/consultas-simples';
import type { TriarAviso } from '../../application/use-cases/triar-aviso';
import { AvisosController, ParametrosIngestaoController } from './avisos.controller';
import { IgnorarAvisoDto, SelosAvisoQueryDto } from './dto/aviso.dto';

const ator = {
  tipo: 'usuario',
  usuarioId: 'u1',
  papeis: [{ id: 'p1', nome: 'Financeiro' }],
} as PrincipalUsuario;
const comPapeis = { ...ator, papeisIds: ['p1'] };
const reflector = new Reflector();

describe('AvisosController', () => {
  const exigidas = (m: keyof AvisosController) =>
    reflector.get(PERMISSOES_EXIGIDAS, AvisosController.prototype[m]);

  it('fica em /ingestao/avisos; ver exige avisos.ver e triar avisos.triar', () => {
    expect(reflector.get(PATH_METADATA, AvisosController)).toBe('ingestao/avisos');
    expect(exigidas('listar')).toEqual(['avisos.ver']);
    expect(exigidas('obter')).toEqual(['avisos.ver']);
    expect(exigidas('ignorar')).toEqual(['avisos.triar']);
    expect(exigidas('reabrir')).toEqual(['avisos.triar']);
    expect(exigidas('resumoDoResponsavel')).toEqual(['avisos.ver']);
    expect(exigidas('selosDosItens')).toEqual(['avisos.ver']);
  });

  it('lista, abre e tria com o acesso de quem está logado', async () => {
    const listar = {
      executar: vi.fn(async () => ({ itens: [], total: 0, tipos: ['cliente'] })),
      obter: vi.fn(async () => ({ id: 'a1' })),
    };
    const triar = { ignorar: vi.fn(async () => undefined), reabrir: vi.fn(async () => undefined) };
    const resumo = { executar: vi.fn(async () => ({ total: 0, maisAntigoEm: null, tipos: [] })) };
    const selos = { executar: vi.fn(async () => []) };
    const controller = new AvisosController(
      listar as unknown as ListarAvisos,
      triar as unknown as TriarAviso,
      resumo as unknown as ResumoAvisosDoResponsavel,
      selos as unknown as SelosDeAviso,
    );

    expect(
      await controller.listar(ator, {
        pagina: 1,
        porPagina: 25,
        status: 'pendente',
        tipo: 'cliente',
        busca: 'x',
        meus: true,
        competencia: '2026-10',
        entidade: 'cliente',
        entidadeId: 'c1',
      }),
    ).toEqual({ itens: [], total: 0, tipos: ['cliente'], pagina: 1, porPagina: 25 });
    expect(listar.executar).toHaveBeenCalledWith(
      {
        pagina: 1,
        porPagina: 25,
        status: 'pendente',
        tipo: 'cliente',
        busca: 'x',
        meus: true,
        competencia: '2026-10',
        entidade: { tipo: 'cliente', id: 'c1' },
      },
      comPapeis,
    );
    await controller.resumoDoResponsavel(ator);
    expect(resumo.executar).toHaveBeenCalledWith(comPapeis);
    await controller.selosDosItens(ator, { entidade: 'cliente', ids: ['c1'] });
    expect(selos.executar).toHaveBeenCalledWith('cliente', ['c1'], ator);
    expect(await controller.obter(ator, 'a1')).toEqual({ id: 'a1' });
    expect(listar.obter).toHaveBeenCalledWith('a1', ator);
    await controller.ignorar(ator, 'a1', { motivo: 'teste' });
    expect(triar.ignorar).toHaveBeenCalledWith(ator, 'a1', 'teste');
    await controller.reabrir(ator, 'a1');
    expect(triar.reabrir).toHaveBeenCalledWith(ator, 'a1');
  });
});

describe('SelosAvisoQueryDto', () => {
  it('lê os ids separados por vírgula e recusa id que não é uuid', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'query', metatype: SelosAvisoQueryDto });
    const id = '6f1c1a52-5d1c-4f6a-9a37-0a0a0a0a0a0a';

    await expect(validar({ entidade: 'cliente', ids: `${id}, ${id}` })).resolves.toMatchObject({
      ids: [id, id],
    });
    await expect(validar({ entidade: 'cliente', ids: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('IgnorarAvisoDto', () => {
  it('exige o motivo: vazio ou só espaços é recusado', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'body', metatype: IgnorarAvisoDto });

    await expect(validar({ motivo: ' Cliente de teste ' })).resolves.toMatchObject({
      motivo: 'Cliente de teste',
    });
    await expect(validar({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar({ motivo: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar({ motivo: 'x'.repeat(301) })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ParametrosIngestaoController', () => {
  const exigidas = (m: keyof ParametrosIngestaoController) =>
    reflector.get(PERMISSOES_EXIGIDAS, ParametrosIngestaoController.prototype[m]);

  it('fica em /ingestao/parametros; ler exige importacao.ver e editar a permissão sensível', () => {
    expect(reflector.get(PATH_METADATA, ParametrosIngestaoController)).toBe('ingestao/parametros');
    expect(exigidas('obter')).toEqual(['importacao.ver']);
    expect(exigidas('atualizar')).toEqual(['importacao.parametros.editar']);
  });

  it('atualiza em nome de quem está logado', async () => {
    const atualizar = { executar: vi.fn(async () => undefined) };
    const controller = new ParametrosIngestaoController(
      {} as ObterParametros,
      atualizar as unknown as AtualizarParametros,
    );
    const corpo = {
      travaRemocaoMinimo: 1,
      travaRemocaoFator: 2,
      retencaoLinhasBrutasDias: 3,
      mobilemedIntervaloMinutos: null,
      mobilemedMesesAnteriores: 1,
      mobilemedJanelaDias: 7,
      mobilemedTeto: 50_000,
      mobilemedCompartilhamentoUnidades: ['CRD_APOIO'],
    };

    await controller.atualizar(ator, corpo);

    expect(atualizar.executar).toHaveBeenCalledWith('u1', corpo);
  });
});
