import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { AtualizarParametros } from '../../application/use-cases/atualizar-parametros';
import type { ListarAvisos, ObterParametros } from '../../application/use-cases/consultas-simples';
import type { TriarAviso } from '../../application/use-cases/triar-aviso';
import { AvisosController, ParametrosIngestaoController } from './avisos.controller';
import { IgnorarAvisoDto } from './dto/aviso.dto';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
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
  });

  it('lista com os filtros e tria em nome de quem está logado', async () => {
    const listar = {
      executar: vi.fn(async () => ({ itens: [], total: 0 })),
      obter: vi.fn(async () => ({ id: 'a1' })),
    };
    const triar = { ignorar: vi.fn(async () => undefined), reabrir: vi.fn(async () => undefined) };
    const controller = new AvisosController(
      listar as unknown as ListarAvisos,
      triar as unknown as TriarAviso,
    );

    expect(
      await controller.listar({
        pagina: 1,
        porPagina: 25,
        status: 'pendente',
        tipo: 'cliente',
        busca: 'x',
      }),
    ).toEqual({ itens: [], total: 0, pagina: 1, porPagina: 25 });
    expect(listar.executar).toHaveBeenCalledWith({
      pagina: 1,
      porPagina: 25,
      status: 'pendente',
      tipo: 'cliente',
      busca: 'x',
    });
    expect(await controller.obter('a1')).toEqual({ id: 'a1' });
    await controller.ignorar(ator, 'a1', { motivo: 'teste' });
    expect(triar.ignorar).toHaveBeenCalledWith('u1', 'a1', 'teste');
    await controller.reabrir(ator, 'a1');
    expect(triar.reabrir).toHaveBeenCalledWith('u1', 'a1');
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
