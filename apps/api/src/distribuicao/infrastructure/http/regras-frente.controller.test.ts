import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  DefinirRegrasFrente,
  ListarRegrasFrente,
  ObterRegrasFrente,
} from '../../application/use-cases/regras-frente';
import { REGRAS_NEUTRAS } from '../../domain/motor/configuracao';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import type { RegrasFrenteDto } from './dto/regras-frente.dto';
import { RegrasFrenteController } from './regras-frente.controller';
import { regrasDoDto, regrasParaDto } from './regras-frente.mapper';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const MAMA = { tipo: 'especialidade' as const, especialidadeId: 'mama', modalidadeId: null };
const CT = { tipo: 'modalidade' as const, especialidadeId: null, modalidadeId: 'ct' };
const neutroDto = (): RegrasFrenteDto => regrasParaDto({ frente: MAMA, ...REGRAS_NEUTRAS });

describe('controller das regras da frente', () => {
  it('ler pede distribuicao-config.ver, gravar pede distribuicao-config.editar', () => {
    const c = RegrasFrenteController.prototype;
    expect(reflector.get(PATH_METADATA, RegrasFrenteController)).toBe('distribuicao/regras-frente');
    for (const m of [c.listar, c.obterEspecialidade, c.obterModalidade])
      expect(exigidas(m)).toEqual(['distribuicao-config.ver']);
    for (const m of [c.salvarEspecialidade, c.salvarModalidade])
      expect(exigidas(m)).toEqual(['distribuicao-config.editar']);
  });

  it('a neutra vira "padrão" na Lista e divisão igualitária sem proporções', () => {
    expect(neutroDto()).toMatchObject({
      listaPrioridadeIds: null,
      listaPrazo: 'padrao',
      listaPrazoMinimoHoras: null,
      divisao: 'igualitaria',
      proporcoes: [],
    });
    expect(regrasDoDto(neutroDto())).toEqual(REGRAS_NEUTRAS);
  });

  it('"segue o SLA" e "prazo mínimo" vão e voltam', () => {
    const sla = regrasDoDto({ ...neutroDto(), listaPrazo: 'sla', listaPrioridadeIds: [] });
    expect(sla).toMatchObject({ listaPrazoMinimoHoras: null, listaPrioridadeIds: [] });
    expect(regrasParaDto({ frente: MAMA, ...sla }).listaPrazo).toBe('sla');
    const minimo = regrasDoDto({ ...neutroDto(), listaPrazo: 'minimo', listaPrazoMinimoHoras: 12 });
    expect(minimo.listaPrazoMinimoHoras).toBe(12);
    expect(regrasParaDto({ frente: MAMA, ...minimo })).toMatchObject({
      listaPrazo: 'minimo',
      listaPrazoMinimoHoras: 12,
    });
  });

  it('recusa prazo mínimo sem horas, horas fora do "mínimo" e proporção na igualitária', () => {
    expect(() => regrasDoDto({ ...neutroDto(), listaPrazo: 'minimo' })).toThrow(
      ConfiguracaoInvalidaError,
    );
    expect(() => regrasDoDto({ ...neutroDto(), listaPrazoMinimoHoras: 3 })).toThrow(
      ConfiguracaoInvalidaError,
    );
    expect(() =>
      regrasDoDto({ ...neutroDto(), proporcoes: [{ modalidadeId: 'mr', percentual: 100 }] }),
    ).toThrow(ConfiguracaoInvalidaError);
  });

  it('lê e grava pela especialidade ou pela modalidade, em nome de quem está logado', async () => {
    const obter = {
      executar: vi.fn(async (frente) => ({
        regras: { frente, ...REGRAS_NEUTRAS },
        cadastrada: false,
      })),
    };
    const definir = { executar: vi.fn(async () => undefined) };
    const listar = { executar: vi.fn(async () => [{ frente: CT, ...REGRAS_NEUTRAS }]) };
    const c = new RegrasFrenteController(
      obter as unknown as ObterRegrasFrente,
      definir as unknown as DefinirRegrasFrente,
      listar as unknown as ListarRegrasFrente,
    );
    expect(await c.obterEspecialidade('mama')).toEqual({
      frente: MAMA,
      regras: neutroDto(),
      cadastrada: false,
    });
    expect((await c.obterModalidade('ct')).frente).toEqual(CT);
    expect(await c.listar()).toEqual([{ frente: CT, regras: neutroDto(), cadastrada: true }]);
    await c.salvarModalidade(ator, 'ct', neutroDto());
    expect(definir.executar).toHaveBeenCalledWith(
      { tipo: 'usuario', id: 'u1' },
      CT,
      REGRAS_NEUTRAS,
    );
    await c.salvarEspecialidade(ator, 'mama', neutroDto());
    expect(definir.executar).toHaveBeenLastCalledWith(
      { tipo: 'usuario', id: 'u1' },
      MAMA,
      REGRAS_NEUTRAS,
    );
  });
});
