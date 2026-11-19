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
    ['DISTRIBUICAO_MOBILEMED', 'producao'],
    ['INGESTAO_MOBILEMED', 'sim'],
    ['MOBILEMED_REPORTS_API_URL', 'http://gateway-sa.mobilemed.com.br/reports-api'],
    ['MOBILEMED_PORTAL_API_URL', 'http://gateway-sa.mobilemed.com.br/portal-api'],
    ['MOBILEMED_PAGINA', '0'],
    ['MOBILEMED_MAXIMO_EXAMES', 'muitos'],
    ['MOBILEMED_TIMEOUT_MS', '10'],
    ['MOBILEMED_CONCORRENCIA', '0'],
    ['MOBILEMED_LIMITE_ANOMALIAS', '0'],
    ['MOBILEMED_TOTP_SEGREDO', 'chave-com-1-e-8'],
  ])('recusa %s=%s, dizendo qual variável está errada', (nome, valor) => {
    expect(() => validarAmbiente({ ...minimo, [nome]: valor })).toThrow(nome);
  });

  it('a MobileMed real só sobe com usuário, senha e chave TOTP da conta de serviço', () => {
    const login = {
      MOBILEMED_USUARIO: 'robo@exemplo.com',
      MOBILEMED_SENHA: 's',
      MOBILEMED_TOTP_SEGREDO: 'JBSW Y3DP EHPK 3PXP',
    };
    for (const nome of Object.keys(login)) {
      expect(() =>
        validarAmbiente({ ...minimo, ...login, [nome]: '', DISTRIBUICAO_MOBILEMED: 'real' }),
      ).toThrow(`${nome}: obrigatória com DISTRIBUICAO_MOBILEMED=real`);
    }
    expect(validarAmbiente({ ...minimo, ...login, DISTRIBUICAO_MOBILEMED: 'real' })).toMatchObject({
      DISTRIBUICAO_MOBILEMED: 'real',
    });
    // Sem "real" (fila sintética), as credenciais não são exigidas.
    expect(validarAmbiente({ ...minimo, DISTRIBUICAO_MOBILEMED: 'fake' })).toBeTruthy();
  });

  it('a importação real da MobileMed também exige a conta de serviço', () => {
    expect(() =>
      validarAmbiente({ ...minimo, INGESTAO_MOBILEMED: 'real', MOBILEMED_USUARIO: 'robo@x' }),
    ).toThrow('MOBILEMED_SENHA: obrigatória com INGESTAO_MOBILEMED=real');
    expect(validarAmbiente({ ...minimo, INGESTAO_MOBILEMED: 'fake' })).toBeTruthy();
  });

  it('o erro da chave TOTP não repete o valor', () => {
    expect(() => validarAmbiente({ ...minimo, MOBILEMED_TOTP_SEGREDO: 'segredo-errado' })).toThrow(
      /^(?![\s\S]*segredo-errado)/,
    );
  });
});
