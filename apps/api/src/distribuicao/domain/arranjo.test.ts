import { describe, expect, it } from 'vitest';
import { comTodasPadrao } from '../testing/fakes';

import {
  type Arranjo,
  ArranjoInvalidoError,
  normalizarArranjo,
  sugestaoAlocacao,
  validarArranjos,
} from './arranjo';

const arranjo = (parcial: Partial<Arranjo> = {}): Arranjo =>
  comTodasPadrao({
    especialidadeId: 'esp',
    modalidadeId: null,
    especialidadeIds: [],
    modalidadeIds: [],
    subespecialidadeIds: [],
    subespecialidadeGeral: false,
    prioridadeIds: [],
    modoClientes: 'todos',
    clienteIds: [],
    modoExames: 'todos',
    exameIds: [],
    clientesExclusivosIds: [],
    ...parcial,
  });

describe('validarArranjos', () => {
  it('aceita arranjo só com a frente (lauda tudo dela)', () => {
    expect(() => validarArranjos([arranjo()], 'medico')).not.toThrow();
    expect(() =>
      validarArranjos([arranjo({ especialidadeId: null, modalidadeId: 'rx' })], 'medico'),
    ).not.toThrow();
  });

  it('recusa arranjo sem frente ou com as duas', () => {
    expect(() => validarArranjos([arranjo({ especialidadeId: null })], 'medico')).toThrow(/frente/);
    expect(() => validarArranjos([arranjo({ modalidadeId: 'rx' })], 'medico')).toThrow(/frente/);
  });

  it('frente de modalidade: recorta por especialidades, nunca por modalidades nem segmentos', () => {
    const rx = (p: Partial<Arranjo>) =>
      arranjo({ especialidadeId: null, modalidadeId: 'rx', ...p });
    expect(() =>
      validarArranjos([rx({ especialidadeIds: ['mi', 'msk'] })], 'medico'),
    ).not.toThrow();
    expect(() => validarArranjos([rx({ modalidadeIds: ['ct'] })], 'medico')).toThrow(
      ArranjoInvalidoError,
    );
    expect(() => validarArranjos([rx({ subespecialidadeIds: ['avc'] })], 'medico')).toThrow(
      ArranjoInvalidoError,
    );
    expect(() => validarArranjos([rx({ subespecialidadeGeral: true })], 'medico')).toThrow(
      ArranjoInvalidoError,
    );
    expect(() => validarArranjos([rx({ especialidadeIds: ['mi', 'mi'] })], 'medico')).toThrow(
      /repetid/,
    );
  });

  it('frente de especialidade: recorta por modalidades, nunca por especialidades', () => {
    expect(() =>
      validarArranjos([arranjo({ modalidadeIds: ['ct', 'mr'] })], 'medico'),
    ).not.toThrow();
    expect(() => validarArranjos([arranjo({ especialidadeIds: ['mi'] })], 'medico')).toThrow(
      ArranjoInvalidoError,
    );
  });

  it('vazio nunca é "todas": cada eixo da frente é "todas" ou ao menos um', () => {
    const semNada = { todasModalidades: false, modalidadeIds: [] };
    expect(() => validarArranjos([arranjo(semNada)], 'medico')).toThrow(/ao menos um/);
    expect(() =>
      validarArranjos([arranjo({ todasPrioridades: false, prioridadeIds: [] })], 'medico'),
    ).toThrow(/prioridade/);
    expect(() =>
      validarArranjos([arranjo({ todosSegmentos: false, subespecialidadeIds: [] })], 'medico'),
    ).toThrow(/segmento/);
    expect(() =>
      validarArranjos([arranjo({ todosSegmentos: false, subespecialidadeGeral: true })], 'medico'),
    ).not.toThrow();
    expect(() =>
      validarArranjos(
        [
          arranjo({
            especialidadeId: null,
            modalidadeId: 'rx',
            todasEspecialidades: false,
            especialidadeIds: [],
          }),
        ],
        'medico',
      ),
    ).toThrow(/especialidade/);
  });

  it('recusa "todas" junto com uma lista no mesmo eixo', () => {
    expect(() =>
      validarArranjos([arranjo({ todasModalidades: true, modalidadeIds: ['ct'] })], 'medico'),
    ).toThrow(/não as duas/);
  });

  it('recusa "todos, exceto" sem ninguém na lista', () => {
    expect(() => validarArranjos([arranjo({ modoClientes: 'exceto' })], 'medico')).toThrow(
      /exceto/,
    );
    expect(() => validarArranjos([arranjo({ modoExames: 'exceto' })], 'medico')).toThrow(/exceto/);
  });

  it('normalizarArranjo desliga o "todas" dos eixos que não são da frente', () => {
    const rx = normalizarArranjo(
      arranjo({
        especialidadeId: null,
        modalidadeId: 'rx',
        todasModalidades: true,
        todosSegmentos: true,
      }),
    );
    expect(rx).toMatchObject({
      todasModalidades: false,
      todosSegmentos: false,
      todasEspecialidades: true,
    });
    expect(normalizarArranjo(arranjo({ todasEspecialidades: true })).todasEspecialidades).toBe(
      false,
    );
  });

  it('recusa lista de clientes vazia quando o modo é "apenas"', () => {
    expect(() => validarArranjos([arranjo({ modoClientes: 'apenas' })], 'medico')).toThrow(
      ArranjoInvalidoError,
    );
  });

  it('recusa lista de exames vazia quando o modo é "apenas"', () => {
    expect(() => validarArranjos([arranjo({ modoExames: 'apenas' })], 'medico')).toThrow(
      ArranjoInvalidoError,
    );
  });

  it('recusa clínica exclusiva em arranjo de equipe', () => {
    expect(() => validarArranjos([arranjo({ clientesExclusivosIds: ['c1'] })], 'equipe')).toThrow(
      /equipe/,
    );
  });

  it('recusa clínica exclusiva que o próprio arranjo não atende', () => {
    expect(() =>
      validarArranjos(
        [arranjo({ modoClientes: 'apenas', clienteIds: ['c1'], clientesExclusivosIds: ['c2'] })],
        'medico',
      ),
    ).toThrow(/exclusiva/);
    expect(() =>
      validarArranjos(
        [arranjo({ modoClientes: 'exceto', clienteIds: ['c1'], clientesExclusivosIds: ['c1'] })],
        'medico',
      ),
    ).toThrow(/exclusiva/);
  });

  it('aceita clínica exclusiva atendida pelo arranjo', () => {
    expect(() =>
      validarArranjos(
        [arranjo({ modoClientes: 'apenas', clienteIds: ['c1'], clientesExclusivosIds: ['c1'] })],
        'medico',
      ),
    ).not.toThrow();
  });

  it('recusa lista com item repetido', () => {
    expect(() => validarArranjos([arranjo({ modalidadeIds: ['m1', 'm1'] })], 'medico')).toThrow(
      /repetid/,
    );
  });
});

describe('sugestaoAlocacao', () => {
  const neuro = { tipo: 'especialidade' as const, especialidadeId: 'neuro', modalidadeId: null };
  const rx = { tipo: 'modalidade' as const, especialidadeId: null, modalidadeId: 'rx' };

  it('sem arranjo que cubra a frente, não sugere nada', () => {
    expect(sugestaoAlocacao([arranjo({ especialidadeId: 'mi' })], neuro)).toBeNull();
  });

  it('frente de especialidade: copia prioridades e segmentos do arranjo dela', () => {
    expect(
      sugestaoAlocacao(
        [
          arranjo({
            especialidadeId: 'neuro',
            prioridadeIds: ['rotina'],
            subespecialidadeIds: ['cranio'],
            subespecialidadeGeral: true,
          }),
          arranjo({ especialidadeId: 'mi', prioridadeIds: ['urgencia'] }),
        ],
        neuro,
      ),
    ).toEqual({
      todasPrioridades: false,
      prioridadeIds: ['rotina'],
      todosSegmentos: false,
      subespecialidadeIds: ['cranio'],
      subespecialidadeGeral: true,
    });
  });

  it('dois arranjos da frente: junta os recortes', () => {
    expect(
      sugestaoAlocacao(
        [
          arranjo({
            especialidadeId: 'neuro',
            prioridadeIds: ['rotina'],
            subespecialidadeIds: ['cranio'],
          }),
          arranjo({
            especialidadeId: 'neuro',
            prioridadeIds: ['urgencia'],
            subespecialidadeIds: ['angio'],
          }),
        ],
        neuro,
      ),
    ).toEqual({
      todasPrioridades: false,
      prioridadeIds: ['rotina', 'urgencia'],
      todosSegmentos: false,
      subespecialidadeIds: ['cranio', 'angio'],
      subespecialidadeGeral: false,
    });
  });

  it('um arranjo com "todas" num eixo libera o eixo inteiro', () => {
    expect(
      sugestaoAlocacao(
        [
          arranjo({
            especialidadeId: 'neuro',
            prioridadeIds: ['rotina'],
            subespecialidadeIds: ['cranio'],
          }),
          arranjo({ especialidadeId: 'neuro' }),
        ],
        neuro,
      ),
    ).toEqual({
      todasPrioridades: true,
      prioridadeIds: [],
      todosSegmentos: true,
      subespecialidadeIds: [],
      subespecialidadeGeral: false,
    });
  });

  it('frente de especialidade não é coberta por arranjo de frente de modalidade', () => {
    expect(
      sugestaoAlocacao(
        [arranjo({ especialidadeId: null, modalidadeId: 'rx', especialidadeIds: ['neuro'] })],
        neuro,
      ),
    ).toBeNull();
  });

  it('frente de modalidade: os arranjos dela e os de especialidade que a marcam, só as prioridades', () => {
    expect(
      sugestaoAlocacao(
        [
          arranjo({
            especialidadeId: 'mi',
            modalidadeIds: ['rx'],
            prioridadeIds: ['rotina'],
            subespecialidadeIds: ['x'],
          }),
          arranjo({ especialidadeId: 'msk', modalidadeIds: ['rx'], prioridadeIds: ['urgencia'] }),
          arranjo({ especialidadeId: 'mi', modalidadeIds: ['ct'], prioridadeIds: ['plantao'] }),
          arranjo({
            especialidadeId: null,
            modalidadeId: 'rx',
            especialidadeIds: ['neuro'],
            prioridadeIds: ['internado'],
          }),
          arranjo({ especialidadeId: null, modalidadeId: 'ct', prioridadeIds: ['ambulatorio'] }),
        ],
        rx,
      ),
    ).toEqual({
      todasPrioridades: false,
      prioridadeIds: ['rotina', 'urgencia', 'internado'],
      todosSegmentos: true,
      subespecialidadeIds: [],
      subespecialidadeGeral: false,
    });
  });

  it('frente de modalidade não é coberta por arranjo sem modalidade marcada', () => {
    expect(sugestaoAlocacao([arranjo({ especialidadeId: 'mi' })], rx)).toBeNull();
  });
});
