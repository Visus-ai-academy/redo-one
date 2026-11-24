import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { CriarCorte } from '../../application/use-cases/criar-corte';
import type { ListarCortes } from '../../application/use-cases/listar-cortes';
import type { PreviaCorte } from '../../application/use-cases/previa-corte';
import { CortesController } from './cortes.controller';
import { NovaVigenciaCorteDto } from './dto/corte.dto';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const caso = <T>(executar: (...a: never[]) => unknown) => ({ executar: vi.fn(executar) }) as T;
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

const corpo: NovaVigenciaCorteDto = {
  clienteId: '6f1c2a4e-1b2c-4d5e-8f90-123456789abc',
  desde: '2026-12',
  usaPadrao: false,
  dia: 25,
  ultimoDia: false,
  mes: 'proprio',
  consideraExame: false,
};

describe('controller dos cortes', () => {
  it('listar pede faturamento.ver; prévia e criar pedem faturamento.corte.editar', () => {
    const p = CortesController.prototype;
    expect(reflector.get(PATH_METADATA, CortesController)).toBe('faturamento/cortes');
    expect(exigidas(p.listar)).toEqual(['faturamento.ver']);
    expect(exigidas(p.previa)).toEqual(['faturamento.corte.editar']);
    expect(exigidas(p.criar)).toEqual(['faturamento.corte.editar']);
  });

  it('lista o padrão sem cliente e mostra o corte em campos', async () => {
    const criadoEm = new Date('2026-11-24T15:00:00Z');
    const listar = caso<ListarCortes>(async () => [
      {
        id: 'v2',
        clienteId: null,
        desde: '2027-01',
        corte: { dia: 'ultimo', mes: 'proprio', consideraExame: true },
        criadoEm,
        criadoPor: 'Ana',
      },
      { id: 'v1', clienteId: 'c1', desde: '2026-12', corte: null, criadoEm, criadoPor: null },
    ]);
    const c = new CortesController(
      listar,
      caso<PreviaCorte>(async () => null),
      caso<CriarCorte>(async () => null),
    );

    expect(await c.listar({})).toEqual([
      {
        id: 'v2',
        clienteId: null,
        desde: '2027-01',
        usaPadrao: false,
        dia: null,
        ultimoDia: true,
        mes: 'proprio',
        consideraExame: true,
        criadoEm,
        criadoPor: 'Ana',
      },
      {
        id: 'v1',
        clienteId: 'c1',
        desde: '2026-12',
        usaPadrao: true,
        dia: null,
        ultimoDia: false,
        mes: null,
        consideraExame: null,
        criadoEm,
        criadoPor: null,
      },
    ]);
    expect(listar.executar).toHaveBeenCalledWith(null);
    await c.listar({ clienteId: 'c1' });
    expect(listar.executar).toHaveBeenLastCalledWith('c1');
  });

  it('prévia e criação recebem o pedido; criar grava em nome de quem está logado', async () => {
    const previa = caso<PreviaCorte>(async () => ({ alterados: 0, movimentos: [] }));
    const criar = caso<CriarCorte>(async () => 'v9');
    const c = new CortesController(
      caso<ListarCortes>(async () => []),
      previa,
      criar,
    );

    expect(await c.previa(corpo)).toEqual({ alterados: 0, movimentos: [] });
    expect(previa.executar).toHaveBeenCalledWith(corpo);
    expect(await c.criar(ator, corpo)).toEqual({ id: 'v9' });
    expect(criar.executar).toHaveBeenCalledWith('u1', corpo);
  });

  it('valida o corpo: desde AAAA-MM, dia inteiro de 1 a 31 ou vazio, mês conhecido', () => {
    const erros = (mudanca: Partial<Record<keyof NovaVigenciaCorteDto, unknown>>) =>
      validateSync(plainToInstance(NovaVigenciaCorteDto, { ...corpo, ...mudanca })).map(
        (e) => e.property,
      );
    expect(erros({})).toEqual([]);
    expect(erros({ clienteId: null, dia: null, ultimoDia: true })).toEqual([]);
    expect(erros({ desde: '2026-13' })).toEqual(['desde']);
    expect(erros({ desde: '2026-1' })).toEqual(['desde']);
    expect(erros({ dia: 0 })).toEqual(['dia']);
    expect(erros({ dia: 32 })).toEqual(['dia']);
    expect(erros({ dia: 7.5 })).toEqual(['dia']);
    expect(erros({ dia: undefined })).toEqual(['dia']);
    expect(erros({ mes: 'anterior' })).toEqual(['mes']);
    expect(erros({ clienteId: 'c1' })).toEqual(['clienteId']);
    expect(erros({ consideraExame: 'sim' })).toEqual(['consideraExame']);
  });
});
