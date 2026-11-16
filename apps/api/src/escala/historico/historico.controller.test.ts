import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { ListarHistoricoDto } from './dto/historico.dto';
import { HistoricoEscalaController } from './historico.controller';
import type { HistoricoEscalaService } from './historico.service';

describe('HistoricoEscalaController', () => {
  const reflector = new Reflector();

  it('fica em /escala/historico e exige escala.historico.ver', () => {
    expect(reflector.get(PATH_METADATA, HistoricoEscalaController)).toBe('escala/historico');
    expect(reflector.get(PERMISSOES_EXIGIDAS, HistoricoEscalaController.prototype.listar)).toEqual([
      'escala.historico.ver',
    ]);
  });

  it('lista no recorte de quem está logado e devolve a página', async () => {
    const service = {
      listar: vi.fn(async () => ({ itens: [], total: 7, nomes: { 't-1': 'Manhã' } })),
    };
    const controller = new HistoricoEscalaController(service as unknown as HistoricoEscalaService);
    const query = plainToInstance(ListarHistoricoDto, {
      entidade: 'ausencia',
      de: '2026-11-01',
      pagina: '2',
    });

    const resposta = await controller.listar(
      { usuarioId: 'u-carla', acessoTotal: false } as PrincipalUsuario,
      query,
    );

    expect(service.listar).toHaveBeenCalledWith(
      { usuarioId: 'u-carla', acessoTotal: false },
      { entidade: 'ausencia', de: '2026-11-01', pagina: 2, porPagina: 25 },
    );
    expect(resposta).toEqual({
      itens: [],
      total: 7,
      nomes: { 't-1': 'Manhã' },
      pagina: 2,
      porPagina: 25,
    });
  });

  it('recusa entidade fora da escala e data fora do formato', async () => {
    const erros = await validate(
      plainToInstance(ListarHistoricoDto, { entidade: 'medico', de: '01/11/2026' }),
    );
    expect(erros.map((e) => e.property).sort()).toEqual(['de', 'entidade']);
  });
});
