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
    ['S3_ENDPOINT', 'localhost:9000'],
    ['S3_FORCAR_PATH_STYLE', 'sim'],
    ['PACIENTE_HMAC_SEGREDO', 'curto'],
    ['DISTRIBUICAO_FAKE_TAMANHO', 'muitos'],
    ['DISTRIBUICAO_FAKE_SEMENTE', '-1'],
    ['DISTRIBUICAO_FAKE_FALHAS_PCT', '101'],
    ['DISTRIBUICAO_FAKE_POR_FORA_PCT', '200'],
    ['DISTRIBUICAO_FAKE_ABERTOS_PCT', '101'],
  ])('recusa %s=%s, dizendo qual variável está errada', (nome, valor) => {
    expect(() => validarAmbiente({ ...minimo, [nome]: valor })).toThrow(nome);
  });
});
