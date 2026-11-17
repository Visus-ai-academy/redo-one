import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { ConsultarArranjos, SalvarArranjos } from '../../application/use-cases/arranjos';
import type { DefinirRoboMedico, ObterRoboMedico } from '../../application/use-cases/robo-medico';
import type { SugerirAlocacao } from '../../application/use-cases/sugerir-alocacao';
import type { DefinirUsoEquipe, ObterUsoEquipe } from '../../application/use-cases/uso-equipe';
import { arranjoVazio } from '../../testing/fakes';
import {
  DistribuicaoEquipeController,
  DistribuicaoMedicoController,
  SugestaoAlocacaoController,
} from './arranjos.controller';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);

describe('controllers dos arranjos', () => {
  it('ler pede medicos.distribuicao.ver, gravar pede medicos.distribuicao.editar, sugerir pede escala.ver', () => {
    const m = DistribuicaoMedicoController.prototype;
    const e = DistribuicaoEquipeController.prototype;
    expect(reflector.get(PATH_METADATA, DistribuicaoMedicoController)).toBe(
      'distribuicao/medicos/:medicoId',
    );
    expect(exigidas(m.obter)).toEqual(['medicos.distribuicao.ver']);
    expect(exigidas(m.salvarArranjos)).toEqual(['medicos.distribuicao.editar']);
    expect(exigidas(m.salvarRobo)).toEqual(['medicos.distribuicao.editar']);
    expect(exigidas(e.obter)).toEqual(['medicos.distribuicao.ver']);
    expect(exigidas(e.salvarArranjos)).toEqual(['medicos.distribuicao.editar']);
    expect(exigidas(e.salvarUso)).toEqual(['medicos.distribuicao.editar']);
    expect(exigidas(SugestaoAlocacaoController.prototype.obter)).toEqual(['escala.ver']);
  });

  it('médico: junta arranjos e robô; grava em nome de quem está logado', async () => {
    const consultar = {
      executar: vi.fn(async () => ({ arranjos: [arranjoVazio()], clientes: [], exames: [] })),
    };
    const salvar = { executar: vi.fn(async () => undefined) };
    const obterRobo = { executar: vi.fn(async () => ({ habilitadoRobo: true })) };
    const definirRobo = { executar: vi.fn(async () => undefined) };
    const c = new DistribuicaoMedicoController(
      consultar as unknown as ConsultarArranjos,
      salvar as unknown as SalvarArranjos,
      obterRobo as unknown as ObterRoboMedico,
      definirRobo as unknown as DefinirRoboMedico,
    );

    expect(await c.obter('m1')).toEqual({
      arranjos: [arranjoVazio()],
      clientes: [],
      exames: [],
      habilitadoRobo: true,
    });
    expect(consultar.executar).toHaveBeenCalledWith({ tipo: 'medico', id: 'm1' });
    await c.salvarArranjos(ator, 'm1', { arranjos: [arranjoVazio()] });
    expect(salvar.executar).toHaveBeenCalledWith(
      { tipo: 'usuario', id: 'u1' },
      { tipo: 'medico', id: 'm1' },
      [arranjoVazio()],
    );
    await c.salvarRobo(ator, 'm1', { habilitadoRobo: false });
    expect(definirRobo.executar).toHaveBeenCalledWith({ tipo: 'usuario', id: 'u1' }, 'm1', {
      habilitadoRobo: false,
    });
  });

  it('equipe: junta arranjos e uso (plantão); grava o uso em nome de quem está logado', async () => {
    const consultar = {
      executar: vi.fn(async () => ({ arranjos: [], clientes: [], exames: [] })),
    };
    const salvar = { executar: vi.fn(async () => undefined) };
    const obterUso = { executar: vi.fn(async () => ({ plantao: true })) };
    const definirUso = { executar: vi.fn(async () => undefined) };
    const c = new DistribuicaoEquipeController(
      consultar as unknown as ConsultarArranjos,
      salvar as unknown as SalvarArranjos,
      obterUso as unknown as ObterUsoEquipe,
      definirUso as unknown as DefinirUsoEquipe,
    );

    expect(await c.obter('eq1')).toEqual({ arranjos: [], clientes: [], exames: [], plantao: true });
    expect(consultar.executar).toHaveBeenCalledWith({ tipo: 'equipe', id: 'eq1' });
    await c.salvarUso(ator, 'eq1', { plantao: false });
    expect(definirUso.executar).toHaveBeenCalledWith({ tipo: 'usuario', id: 'u1' }, 'eq1', {
      plantao: false,
    });
  });

  it('sugestão vem embrulhada (null quando não há arranjo da frente)', async () => {
    const sugerir = { executar: vi.fn(async () => null) };
    const c = new SugestaoAlocacaoController(sugerir as unknown as SugerirAlocacao);
    expect(await c.obter({ medicoId: 'm1', frenteId: 'f1' })).toEqual({ sugestao: null });
    expect(sugerir.executar).toHaveBeenCalledWith('m1', 'f1');
  });
});
