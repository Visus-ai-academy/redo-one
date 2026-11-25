import { beforeEach, describe, expect, it } from 'vitest';

import { ArranjosEmMemoria, arranjoVazio, CadastrosEmMemoria } from '../../testing/fakes';
import { FrenteNaoEncontradaError, MedicoNaoEncontradoError } from '../erros';
import { SugerirAlocacao } from './sugerir-alocacao';

describe('SugerirAlocacao', () => {
  let arranjos: ArranjosEmMemoria;
  let sugerir: SugerirAlocacao;

  beforeEach(() => {
    arranjos = new ArranjosEmMemoria();
    const cadastros = new CadastrosEmMemoria();
    cadastros.medicos.add('m1');
    cadastros.frentes.set('f-neuro', {
      tipo: 'especialidade',
      especialidadeId: 'neuro',
      modalidadeId: null,
    });
    sugerir = new SugerirAlocacao(arranjos, cadastros);
  });

  it('sugere pelos arranjos do médico na frente', async () => {
    arranjos.porDono.set('medico:m1', [
      arranjoVazio({ especialidadeId: 'neuro', prioridadeIds: ['rotina'] }),
    ]);
    expect(await sugerir.executar('m1', 'f-neuro')).toEqual({
      todasPrioridades: false,
      prioridadeIds: ['rotina'],
      todosSegmentos: true,
      subespecialidadeIds: [],
      subespecialidadeGeral: false,
    });
  });

  it('sem arranjo na frente, devolve null', async () => {
    expect(await sugerir.executar('m1', 'f-neuro')).toBeNull();
  });

  it('médico ou frente inexistente dá não encontrado', async () => {
    await expect(sugerir.executar('x', 'f-neuro')).rejects.toThrow(MedicoNaoEncontradoError);
    await expect(sugerir.executar('m1', 'x')).rejects.toThrow(FrenteNaoEncontradaError);
  });
});
