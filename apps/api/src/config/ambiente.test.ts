import { describe, expect, it } from 'vitest';

import { validarAmbiente } from './ambiente';

const minimo = { DATABASE_URL: 'postgresql://u:s@localhost:5432/one' };

describe('validarAmbiente', () => {
  it('aceita o mínimo e devolve as variáveis como vieram', () => {
    expect(validarAmbiente({ ...minimo, PORT: '3000' })).toMatchObject({ ...minimo, PORT: '3000' });
  });

  it('a API não sobe sem DATABASE_URL', () => {
    expect(() => validarAmbiente({})).toThrow('DATABASE_URL');
  });

  it.each([
    ['PORT', 'abc'],
    ['JOBS_WORKER', 'sim'],
    ['APP_URL', 'localhost:5173'],
    ['DATABASE_URL', 'mysql://x'],
  ])('recusa %s=%s, dizendo qual variável está errada', (nome, valor) => {
    expect(() => validarAmbiente({ ...minimo, [nome]: valor })).toThrow(nome);
  });
});
