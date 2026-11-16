import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS, ROTA_DE_ROBO } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { ListarOcorrenciasDto } from './dto/ocorrencias.dto';
import { MinhaEscalaController } from './minha-escala.controller';
import { OcorrenciasController } from './ocorrencias.controller';
import type { OcorrenciasService } from './ocorrencias.service';

const principal = { usuarioId: 'u-1', acessoTotal: false } as PrincipalUsuario;

describe('OcorrenciasController', () => {
  const reflector = new Reflector();

  it('fica em /escala/ocorrencias e exige escala.ver', () => {
    expect(reflector.get(PATH_METADATA, OcorrenciasController)).toBe('escala/ocorrencias');
    expect(reflector.get(PERMISSOES_EXIGIDAS, OcorrenciasController.prototype.listar)).toEqual([
      'escala.ver',
    ]);
  });

  it('repassa a janela, os filtros e quem consulta', async () => {
    const resultado = { ocorrencias: [], conflitos: [] };
    const service = { listar: vi.fn(async () => resultado) };
    const controller = new OcorrenciasController(service as unknown as OcorrenciasService);
    const query = plainToInstance(ListarOcorrenciasDto, {
      de: '2026-11-01',
      ate: '2026-11-30',
      turnoIds: 'a0000000-0000-4000-8000-000000000001,a0000000-0000-4000-8000-000000000002',
    });

    expect(await controller.listar(principal, query)).toBe(resultado);
    expect(service.listar).toHaveBeenCalledWith(
      { usuarioId: 'u-1', acessoTotal: false },
      {
        de: '2026-11-01',
        ate: '2026-11-30',
        turnoIds: ['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'],
      },
    );
  });

  it('valida datas e ids da query', async () => {
    const erros = await validate(
      plainToInstance(ListarOcorrenciasDto, {
        de: '01/11/2026',
        ate: '2026-11-31',
        frenteIds: 'x',
      }),
    );
    expect(erros.map((e) => e.property).sort()).toEqual(['ate', 'de', 'frenteIds']);
  });
});

describe('MinhaEscalaController', () => {
  const reflector = new Reflector();

  it('fica em /escala/portal/minha-escala, só exige sessão e não aceita robô', () => {
    expect(reflector.get(PATH_METADATA, MinhaEscalaController)).toBe('escala/portal/minha-escala');
    expect(
      reflector.get(PERMISSOES_EXIGIDAS, MinhaEscalaController.prototype.listar),
    ).toBeUndefined();
    expect(reflector.get(ROTA_DE_ROBO, MinhaEscalaController.prototype.listar)).toBeUndefined();
  });

  it('consulta a escala do usuário logado', async () => {
    const resultado = { ocorrencias: [], conflitos: [] };
    const service = { minhaEscala: vi.fn(async () => resultado) };
    const controller = new MinhaEscalaController(service as unknown as OcorrenciasService);

    expect(await controller.listar(principal, { de: '2026-11-01', ate: '2026-11-07' })).toBe(
      resultado,
    );
    expect(service.minhaEscala).toHaveBeenCalledWith('u-1', {
      de: '2026-11-01',
      ate: '2026-11-07',
    });
  });
});
