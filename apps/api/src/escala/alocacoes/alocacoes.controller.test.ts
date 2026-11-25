import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import type { AjustesProdutividadeService } from './ajustes.service';
import { AlocacoesController, CoberturasController } from './alocacoes.controller';
import type { AlocacoesService } from './alocacoes.service';
import { AjusteDto, AlocacaoDto, CoberturaDto } from './dto/alocacao.dto';

const principal = { usuarioId: 'u-1', acessoTotal: false } as PrincipalUsuario;
const ator = { usuarioId: 'u-1', acessoTotal: false };
const UUID = 'a0000000-0000-4000-8000-000000000001';

function montar() {
  const alocacoes = {
    obter: vi.fn(async () => ({ id: UUID })),
    criar: vi.fn(async () => ({ id: UUID, avisos: [] })),
    atualizar: vi.fn(async () => ({ avisos: [] })),
    remover: vi.fn(async () => undefined),
    criarCobertura: vi.fn(async () => ({ id: UUID, avisos: [] })),
    atualizarCobertura: vi.fn(async () => ({ avisos: [] })),
  };
  const ajustes = { definir: vi.fn(async () => undefined) };
  return {
    alocacoes,
    ajustes,
    controller: new AlocacoesController(
      alocacoes as unknown as AlocacoesService,
      ajustes as unknown as AjustesProdutividadeService,
    ),
    coberturas: new CoberturasController(alocacoes as unknown as AlocacoesService),
  };
}

describe('AlocacoesController', () => {
  const reflector = new Reflector();
  const permissao = (metodo: object) => reflector.get(PERMISSOES_EXIGIDAS, metodo as never);

  it('fica em /escala/alocacoes; leitura com escala.ver; criar, editar e remover pelo verbo', () => {
    const p = AlocacoesController.prototype;
    expect(reflector.get(PATH_METADATA, AlocacoesController)).toBe('escala/alocacoes');
    expect(reflector.get(PATH_METADATA, CoberturasController)).toBe('escala/coberturas');
    expect(permissao(p.obter)).toEqual(['escala.ver']);
    expect(permissao(p.criar)).toEqual(['escala.criar']);
    expect(permissao(p.criarCobertura)).toEqual(['escala.criar']);
    expect(permissao(p.atualizar)).toEqual(['escala.editar']);
    expect(permissao(p.definirAjuste)).toEqual(['escala.editar']);
    expect(permissao(CoberturasController.prototype.atualizar)).toEqual(['escala.editar']);
    expect(permissao(p.remover)).toEqual(['escala.excluir']);
  });

  it('repassa quem pede e o corpo a cada ação', async () => {
    const { alocacoes, ajustes, controller, coberturas } = montar();
    const corpo = { medicoId: UUID } as AlocacaoDto;
    const cobertura = { medicoId: UUID } as CoberturaDto;

    await controller.obter(principal, UUID);
    await controller.criar(principal, corpo);
    await controller.atualizar(principal, UUID, corpo);
    await controller.remover(principal, UUID);
    await controller.criarCobertura(principal, UUID, cobertura);
    await coberturas.atualizar(principal, UUID, cobertura);
    await controller.definirAjuste(principal, UUID, '2026-11-16', { produtividade: null });

    expect(alocacoes.obter).toHaveBeenCalledWith(ator, UUID);
    expect(alocacoes.criar).toHaveBeenCalledWith(ator, corpo);
    expect(alocacoes.atualizar).toHaveBeenCalledWith(ator, UUID, corpo);
    expect(alocacoes.remover).toHaveBeenCalledWith(ator, UUID);
    expect(alocacoes.criarCobertura).toHaveBeenCalledWith(ator, UUID, cobertura);
    expect(alocacoes.atualizarCobertura).toHaveBeenCalledWith(ator, UUID, cobertura);
    expect(ajustes.definir).toHaveBeenCalledWith(ator, UUID, '2026-11-16', {
      produtividade: null,
    });
  });

  describe('validação dos corpos', () => {
    const erros = async (classe: new () => object, corpo: object) =>
      (await validate(plainToInstance(classe, corpo))).map((e) => e.property).sort();

    it('alocação: ids, dias, datas e horários', async () => {
      expect(
        await erros(AlocacaoDto, {
          medicoId: UUID,
          turnoId: UUID,
          frenteId: UUID,
          vigencia: 'fixa',
          diasSemana: [1],
          dataInicio: '2026-11-01',
        }),
      ).toEqual([]);
      expect(
        await erros(AlocacaoDto, {
          medicoId: 'x',
          turnoId: UUID,
          frenteId: UUID,
          vigencia: 'aberta',
          diasSemana: [],
          dataInicio: '2026-02-30',
          horarioInicio: '7h',
          produtividade: -1,
        }),
      ).toEqual([
        'dataInicio',
        'diasSemana',
        'horarioInicio',
        'medicoId',
        'produtividade',
        'vigencia',
      ]);
    });

    it('cobertura exige data de fim', async () => {
      expect(await erros(CoberturaDto, { medicoId: UUID, dataInicio: '2026-11-01' })).toEqual([
        'dataFim',
      ]);
    });

    it('ajuste: número ≥ 0 ou nulo, nunca ausente', async () => {
      expect(await erros(AjusteDto, { produtividade: null })).toEqual([]);
      expect(await erros(AjusteDto, { produtividade: 3 })).toEqual([]);
      expect(await erros(AjusteDto, {})).toEqual(['produtividade']);
      expect(await erros(AjusteDto, { produtividade: 1.5 })).toEqual(['produtividade']);
    });
  });
});
