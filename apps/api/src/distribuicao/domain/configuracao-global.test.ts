import { describe, expect, it } from 'vitest';

import {
  CONFIGURACAO_INICIAL,
  type ConfiguracaoGlobal,
  ConfiguracaoInvalidaError,
  normalizarConfiguracao,
  validarConfiguracaoGlobal,
} from './configuracao-global';

const valida = (parcial: Partial<ConfiguracaoGlobal> = {}): ConfiguracaoGlobal => ({
  ...CONFIGURACAO_INICIAL,
  turnosPosteriores: { turnoIds: ['tarde'], cheiaEm: '10:50' },
  ...parcial,
});

const falha = (parcial: Partial<ConfiguracaoGlobal>, trecho: RegExp) =>
  expect(() => validarConfiguracaoGlobal(valida(parcial))).toThrow(trecho);

describe('configuração global da distribuição', () => {
  it('a inicial (sem linha no banco) é válida, sem turnos posteriores', () => {
    expect(() => validarConfiguracaoGlobal(CONFIGURACAO_INICIAL)).not.toThrow();
    expect(CONFIGURACAO_INICIAL.turnosPosteriores).toBeNull();
  });

  it('aceita a configuração de produção', () => {
    expect(() => validarConfiguracaoGlobal(valida())).not.toThrow();
  });

  it('o erro é de domínio, do tipo inválido', () => {
    try {
      validarConfiguracaoGlobal(valida({ cicloMinutos: 0 }));
    } catch (erro) {
      expect(erro).toBeInstanceOf(ConfiguracaoInvalidaError);
    }
    expect.assertions(1);
  });

  it('recusa ordem da fila vazia ou com critério repetido', () => {
    falha({ ordemFila: [] }, /ao menos um critério/);
    falha(
      {
        ordemFila: [
          { criterio: 'prazo', direcao: 'asc' },
          { criterio: 'prazo', direcao: 'desc' },
        ],
      },
      /critério repetido/,
    );
  });

  it.each([
    ['janelaPacienteHoras', -1],
    ['toleranciaAcimaTeto', -1],
    ['margemUrgenciaPct', 101],
    ['folgaProporcaoPct', -5],
    ['prazoCriticoMin', 1.5],
    ['antecedenciaPeriodoMin', -1],
    ['cicloMinutos', 0],
    ['diasJaEntregue', -1],
    ['recolhimentoAposTurnoMin', -1],
  ] as const)('recusa %s = %s', (campo, valor) => {
    falha({ [campo]: valor }, /./);
  });

  it('turnos posteriores precisam de ao menos um turno, sem repetir, e da hora da cheia', () => {
    falha({ turnosPosteriores: { turnoIds: [], cheiaEm: '10:50' } }, /ao menos um turno/);
    falha({ turnosPosteriores: { turnoIds: ['t', 't'], cheiaEm: '10:50' } }, /turno repetido/);
    falha({ turnosPosteriores: { turnoIds: ['t'], cheiaEm: '25:00' } }, /HH:MM/);
  });

  it('marcadores não podem ser vazios nem repetidos (sem diferenciar maiúsculas)', () => {
    falha({ marcadoresEquilibrio: ['  '] }, /marcador vazio/);
    falha({ marcadoresEquilibrio: ['ONCO', 'onco'] }, /marcador repetido/);
  });

  it('normalizar apara os marcadores', () => {
    expect(
      normalizarConfiguracao(valida({ marcadoresEquilibrio: [' ONCO '] })).marcadoresEquilibrio,
    ).toEqual(['ONCO']);
  });
});
