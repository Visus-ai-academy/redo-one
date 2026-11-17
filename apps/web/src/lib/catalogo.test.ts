import { describe, expect, it } from 'vitest';

import { subespecialidadeQueFica, subespecialidadesDaEspecialidade } from './catalogo';

const avc = { id: 'avc', especialidadeIds: ['neuro'] };
const colunas = { id: 'colunas', especialidadeIds: ['neuro', 'msk'] };
const joelho = { id: 'joelho', especialidadeIds: ['msk'] };
const todas = [avc, colunas, joelho];

describe('subespecialidadesDaEspecialidade', () => {
  it('sem especialidade escolhida, oferece todas', () => {
    expect(subespecialidadesDaEspecialidade(todas, undefined)).toEqual(todas);
  });

  it('com especialidade, só as que pertencem a ela', () => {
    expect(subespecialidadesDaEspecialidade(todas, 'msk')).toEqual([colunas, joelho]);
  });
});

describe('subespecialidadeQueFica', () => {
  it('mantém a subespecialidade que pertence à nova especialidade', () => {
    expect(subespecialidadeQueFica(todas, 'colunas', 'msk')).toBe('colunas');
  });

  it('limpa a que não pertence', () => {
    expect(subespecialidadeQueFica(todas, 'avc', 'msk')).toBeUndefined();
  });

  it('sem especialidade, mantém qualquer uma', () => {
    expect(subespecialidadeQueFica(todas, 'avc', undefined)).toBe('avc');
  });

  it('sem subespecialidade, continua sem', () => {
    expect(subespecialidadeQueFica(todas, undefined, 'msk')).toBeUndefined();
  });
});
