import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { DefinirEscalaFixaDto } from './dto/escala-fixa.dto';
import { EscalaFixaController } from './escala-fixa.controller';
import type { EscalaFixaService } from './escala-fixa.service';

const principal = { usuarioId: 'u-1', acessoTotal: false } as PrincipalUsuario;
const ator = { usuarioId: 'u-1', acessoTotal: false };
const UUID = 'a0000000-0000-4000-8000-000000000001';

describe('EscalaFixaController', () => {
  const reflector = new Reflector();
  const permissao = (metodo: object) => reflector.get(PERMISSOES_EXIGIDAS, metodo as never);

  it('fica em /escala/medicos/:medicoId/escala-fixa; ler com escala.ver, salvar com editar', () => {
    const p = EscalaFixaController.prototype;
    expect(reflector.get(PATH_METADATA, EscalaFixaController)).toBe('escala/medicos');
    expect(reflector.get(PATH_METADATA, p.obter)).toBe(':medicoId/escala-fixa');
    expect(reflector.get(PATH_METADATA, p.definir)).toBe(':medicoId/escala-fixa');
    expect(permissao(p.obter)).toEqual(['escala.ver']);
    expect(permissao(p.definir)).toEqual(['escala.alocacao.editar']);
  });

  it('repassa quem pede, o médico, a frente e o corpo', async () => {
    const service = {
      obter: vi.fn(async () => ({ medicoId: UUID, frenteId: UUID, celulas: [], foraDaGrade: 0 })),
      definir: vi.fn(async () => ({
        criadas: 0,
        encerradas: 0,
        removidas: 0,
        mantidas: 0,
        avisos: [],
      })),
    };
    const controller = new EscalaFixaController(service as unknown as EscalaFixaService);
    const corpo = { frenteId: UUID, aPartirDe: '2026-11-23', celulas: [] };

    await controller.obter(principal, UUID, { frenteId: UUID });
    await controller.definir(principal, UUID, corpo);

    expect(service.obter).toHaveBeenCalledWith(ator, UUID, UUID);
    expect(service.definir).toHaveBeenCalledWith(ator, UUID, corpo);
  });

  it('valida o corpo e cada célula', async () => {
    const erros = async (corpo: object) => {
      const lista = await validate(plainToInstance(DefinirEscalaFixaDto, corpo));
      return lista
        .flatMap((e) =>
          e.children?.length
            ? e.children.flatMap((c) =>
                (c.children ?? []).map((n) => `${e.property}.${n.property}`),
              )
            : [e.property],
        )
        .sort();
    };
    const celula = { turnoId: UUID, diaSemana: 1, produtividade: null };

    expect(
      await erros({
        frenteId: UUID,
        aPartirDe: '2026-11-23',
        celulas: [celula, { ...celula, produtividade: 3 }],
      }),
    ).toEqual([]);
    expect(
      await erros({
        frenteId: 'x',
        aPartirDe: '2026-02-30',
        celulas: [
          { turnoId: 'x', diaSemana: 7, produtividade: -1 },
          { turnoId: UUID, diaSemana: 0 },
        ],
      }),
    ).toEqual([
      'aPartirDe',
      'celulas.diaSemana',
      'celulas.produtividade',
      'celulas.produtividade',
      'celulas.turnoId',
      'frenteId',
    ]);
  });
});
