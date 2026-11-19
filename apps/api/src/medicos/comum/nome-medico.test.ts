import { describe, expect, it } from 'vitest';

import { casaNomeMedico, nomeParecido, normalizarNomeMedico } from './nome-medico';

describe('normalizarNomeMedico', () => {
  it('tira acento, maiúsculas e espaços sobrando', () => {
    expect(normalizarNomeMedico('  Márcio   SOUSA ')).toBe('marcio sousa');
  });

  it('tira o prefixo Dr. ou Dra., com ou sem ponto e espaço', () => {
    expect(normalizarNomeMedico('Dr. Augusto Lima')).toBe('augusto lima');
    expect(normalizarNomeMedico('Dra Jainy Oliveira')).toBe('jainy oliveira');
    expect(normalizarNomeMedico('Dra.Tatyane Reis')).toBe('tatyane reis');
  });

  it('não come nome que começa com "dr"', () => {
    expect(normalizarNomeMedico('Drauzio Varella')).toBe('drauzio varella');
  });

  it('tira o que está entre parênteses', () => {
    expect(normalizarNomeMedico('Ana Paula (E2)')).toBe('ana paula');
  });

  it('junta apóstrofo e ponto, e troca outros sinais por espaço', () => {
    expect(normalizarNomeMedico("Carla D'Andréa")).toBe('carla dandrea');
    expect(normalizarNomeMedico('João N. Silva-Costa')).toBe('joao n silva costa');
  });
});

// Casos do robô legado (rpa-dashboards-one, `nomes.py::casa_nome`), medidos na MobileMed.
describe('casaNomeMedico', () => {
  it('casa a mesma grafia normalizada', () => {
    expect(casaNomeMedico('Dra. Márcia Souza', 'marcia souza')).toBe(true);
  });

  it('casa o nome com o meio omitido ou abreviado (mesmo primeiro e último)', () => {
    expect(casaNomeMedico('Dr. James Yared', 'Dr. James Henrique Yared')).toBe(true);
    expect(
      casaNomeMedico('Dr. gerson bruno garcia de s. lima', 'Gerson Bruno Garcia de Souza Lima'),
    ).toBe(true);
  });

  it('não casa outro primeiro nome nem outro último sobrenome', () => {
    expect(casaNomeMedico('João S. Lima', 'João Silva')).toBe(false);
    expect(casaNomeMedico('Maria Elena de Lima Araújo', 'Maria Elena de Lima')).toBe(false);
    expect(casaNomeMedico('Pedro Silva', 'João Silva')).toBe(false);
  });

  it('não casa só pelo primeiro nome', () => {
    expect(casaNomeMedico('Ana', 'Ana Silva')).toBe(false);
  });

  it('os do meio casam em ordem', () => {
    expect(casaNomeMedico('Ana Costa Pires Silva', 'Ana Pires Costa Silva')).toBe(false);
  });
});

describe('nomeParecido', () => {
  it('dois núcleos em comum, em qualquer posição, sem contar partículas', () => {
    expect(nomeParecido('Maria Elena de Lima Araújo', 'Dra. Maria Elena de Lima')).toBe(true);
    expect(nomeParecido('Maria da Silva', 'Maria de Souza')).toBe(false);
  });
});
