import { describe, expect, it } from 'vitest';

import { ConflitoEscalaError, EscalaInvalidaError } from '../domain/errors';
import { type DadosTurno, normalizarTurno, verificarMudancaDoTurno } from './turno';

const turno = (extra: Partial<DadosTurno> = {}): DadosTurno => ({
  nome: 'Manhã',
  tipo: 'fixo',
  horarioInicio: '07:00',
  horarioFim: '13:00',
  frenteIds: ['f-neuro', 'f-tc'],
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  ...extra,
});

const rotulos = new Map([
  ['f-neuro', 'NEURO'],
  ['f-tc', 'TC'],
]);

describe('normalizarTurno', () => {
  it('apara textos, normaliza horários e ordena as frentes sem repetir', () => {
    expect(
      normalizarTurno(
        turno({
          nome: '  Manhã ',
          horarioInicio: '7:00',
          horarioFim: ' 13:00',
          frenteIds: ['f-tc', 'f-neuro', 'f-tc'],
          descricao: '  ',
          cor: ' #1F7A4D ',
        }),
      ),
    ).toEqual(turno({ frenteIds: ['f-neuro', 'f-tc'], cor: '#1F7A4D' }));
  });

  it('recusa horário fora do formato', () => {
    expect(() => normalizarTurno(turno({ horarioFim: '24:00' }))).toThrow(EscalaInvalidaError);
  });

  it('recusa nome vazio', () => {
    expect(() => normalizarTurno(turno({ nome: '   ' }))).toThrow(EscalaInvalidaError);
  });
});

describe('verificarMudancaDoTurno', () => {
  const vigente = (
    frenteId: string,
    horarioInicio: string,
    horarioFim: string,
    gratificado = false,
  ) => ({ frenteId, horarioInicio, horarioFim, gratificado });

  it('sem mudar horário nem tirar frente, não confere nada', () => {
    expect(() =>
      verificarMudancaDoTurno(
        turno(),
        turno({ nome: 'Matutino' }),
        [vigente('f-tc', '00:00', '23:00')],
        rotulos,
      ),
    ).not.toThrow();
  });

  it('aceita o novo horário quando todas as alocações vigentes cabem nele', () => {
    expect(() =>
      verificarMudancaDoTurno(
        turno(),
        turno({ horarioInicio: '06:00', horarioFim: '14:00' }),
        [vigente('f-tc', '07:00', '13:00'), vigente('f-neuro', '08:00', '12:00')],
        rotulos,
      ),
    ).not.toThrow();
  });

  it('recusa o horário que deixa alocações vigentes fora da caixa, dizendo quantas', () => {
    const mudar = () =>
      verificarMudancaDoTurno(
        turno(),
        turno({ horarioInicio: '08:00', horarioFim: '12:00' }),
        [
          vigente('f-tc', '07:00', '13:00'),
          vigente('f-neuro', '08:00', '12:00'),
          vigente('f-neuro', '07:00', '10:00'),
        ],
        rotulos,
      );
    expect(mudar).toThrow(ConflitoEscalaError);
    expect(mudar).toThrow(
      '2 alocações vigentes ficariam fora do novo horário do turno (08:00 às 12:00). Ajuste ou encerre essas alocações antes de mudar o horário.',
    );
    try {
      mudar();
    } catch (e) {
      expect((e as ConflitoEscalaError).detalhes).toEqual({ totalAlocacoes: 2 });
    }
  });

  it('no singular quando é uma', () => {
    expect(() =>
      verificarMudancaDoTurno(
        turno(),
        turno({ horarioFim: '12:00' }),
        [vigente('f-tc', '07:00', '13:00')],
        rotulos,
      ),
    ).toThrow('1 alocação vigente ficaria fora do novo horário do turno (07:00 às 12:00).');
  });

  it('vale para turno que vira a meia-noite', () => {
    const plantao = turno({ horarioInicio: '19:00', horarioFim: '07:00' });
    expect(() =>
      verificarMudancaDoTurno(
        plantao,
        turno({ horarioInicio: '19:00', horarioFim: '01:00' }),
        [vigente('f-tc', '22:00', '02:00')],
        rotulos,
      ),
    ).toThrow(ConflitoEscalaError);
    expect(() =>
      verificarMudancaDoTurno(
        plantao,
        turno({ horarioInicio: '18:00', horarioFim: '08:00' }),
        [vigente('f-tc', '22:00', '02:00')],
        rotulos,
      ),
    ).not.toThrow();
  });

  it('recusa tirar do turno uma frente com alocação vigente nele', () => {
    const tirar = () =>
      verificarMudancaDoTurno(
        turno(),
        turno({ frenteIds: ['f-neuro'] }),
        [vigente('f-tc', '07:00', '13:00'), vigente('f-tc', '08:00', '10:00')],
        rotulos,
      );
    expect(tirar).toThrow(ConflitoEscalaError);
    expect(tirar).toThrow(
      'A frente TC tem 2 alocações vigentes neste turno. Encerre ou mova essas alocações antes de tirá-la do turno.',
    );
  });

  it('tira frente sem alocação vigente', () => {
    expect(() =>
      verificarMudancaDoTurno(
        turno(),
        turno({ frenteIds: ['f-neuro'] }),
        [vigente('f-neuro', '07:00', '13:00')],
        rotulos,
      ),
    ).not.toThrow();
  });

  it('recusa trocar a Lista para fixo com alocação gratificada vigente, dizendo quantas', () => {
    const lista = turno({ tipo: 'lista', horarioInicio: '07:00', horarioFim: '07:00' });
    const mudar = () =>
      verificarMudancaDoTurno(
        lista,
        { ...lista, tipo: 'fixo' },
        [
          vigente('f-tc', '07:00', '13:00', true),
          vigente('f-tc', '13:00', '19:00', true),
          vigente('f-neuro', '07:00', '13:00'),
        ],
        rotulos,
      );
    expect(mudar).toThrow(ConflitoEscalaError);
    expect(mudar).toThrow(
      'O turno tem 2 alocações gratificadas vigentes, e gratificação só existe em turno do tipo lista. Encerre essas alocações antes de mudar o tipo.',
    );
  });

  it('troca a Lista para fixo sem gratificada vigente', () => {
    const lista = turno({ tipo: 'lista' });
    expect(() =>
      verificarMudancaDoTurno(
        lista,
        { ...lista, tipo: 'fixo' },
        [vigente('f-tc', '07:00', '13:00')],
        rotulos,
      ),
    ).not.toThrow();
  });
});
