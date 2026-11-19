type Ambiente = Record<string, unknown>;

/**
 * Confere as variáveis de ambiente na subida (ConfigModule `validate`): com algo faltando ou
 * errado, a API não sobe e o erro diz qual variável corrigir (ver `apps/api/.env.example`).
 */
export function validarAmbiente(env: Ambiente): Ambiente {
  const erros: string[] = [];
  const texto = (nome: string) => (typeof env[nome] === 'string' ? (env[nome] as string) : '');
  const opcional = (nome: string, valido: (v: string) => boolean, explicacao: string) => {
    if (texto(nome) && !valido(texto(nome))) erros.push(`${nome}: ${explicacao}`);
  };

  if (!/^postgres(ql)?:\/\//.test(texto('DATABASE_URL'))) {
    erros.push('DATABASE_URL: obrigatória, no formato postgresql://usuario:senha@host:porta/banco');
  }
  opcional('PORT', (v) => /^\d+$/.test(v), 'precisa ser um número');
  opcional('JOBS_WORKER', (v) => v === 'true' || v === 'false', 'use true ou false');
  opcional('APP_URL', (v) => /^https?:\/\//.test(v), 'precisa começar com http:// ou https://');
  opcional('SMTP_URL', (v) => /^smtps?:\/\//.test(v), 'precisa começar com smtp:// ou smtps://');
  opcional('S3_ENDPOINT', (v) => /^https?:\/\//.test(v), 'precisa começar com http:// ou https://');
  opcional('S3_FORCAR_PATH_STYLE', (v) => v === 'true' || v === 'false', 'use true ou false');
  opcional('PACIENTE_HMAC_SEGREDO', (v) => v.length >= 32, 'precisa ter pelo menos 32 caracteres');
  const inteiroAte = (max: number) => (v: string) => /^\d+$/.test(v) && Number(v) <= max;
  opcional('DISTRIBUICAO_FAKE_TAMANHO', inteiroAte(100_000), 'inteiro de 0 a 100000');
  opcional('DISTRIBUICAO_FAKE_SEMENTE', inteiroAte(4_294_967_295), 'inteiro não negativo');
  opcional('DISTRIBUICAO_FAKE_FALHAS_PCT', inteiroAte(100), 'inteiro de 0 a 100');
  opcional('DISTRIBUICAO_FAKE_POR_FORA_PCT', inteiroAte(100), 'inteiro de 0 a 100');
  opcional('DISTRIBUICAO_FAKE_ABERTOS_PCT', inteiroAte(100), 'inteiro de 0 a 100');

  opcional('DISTRIBUICAO_MOBILEMED', (v) => v === 'fake' || v === 'real', 'use fake ou real');
  opcional(
    'MOBILEMED_PORTAL_API_URL',
    (v) => /^https:\/\//.test(v),
    'precisa começar com https://',
  );
  const inteiroEntre = (min: number, max: number) => (v: string) =>
    /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;
  opcional('MOBILEMED_PAGINA', inteiroEntre(1, 5_000), 'inteiro de 1 a 5000');
  opcional('MOBILEMED_MAXIMO_EXAMES', inteiroEntre(1, 1_000_000), 'inteiro de 1 a 1000000');
  opcional('MOBILEMED_TIMEOUT_MS', inteiroEntre(1_000, 600_000), 'inteiro de 1000 a 600000');
  opcional('MOBILEMED_CONCORRENCIA', inteiroEntre(1, 10), 'inteiro de 1 a 10');
  opcional('MOBILEMED_LIMITE_ANOMALIAS', inteiroEntre(1, 100), 'inteiro de 1 a 100');
  opcional(
    'MOBILEMED_TOTP_SEGREDO',
    (v) => /^[A-Z2-7]+=*$/i.test(v.replace(/\s/g, '')),
    'chave base32 do autenticador (letras A-Z e dígitos 2-7)',
  );
  if (texto('DISTRIBUICAO_MOBILEMED') === 'real') {
    for (const nome of ['MOBILEMED_USUARIO', 'MOBILEMED_SENHA', 'MOBILEMED_TOTP_SEGREDO']) {
      if (!texto(nome)) erros.push(`${nome}: obrigatória com DISTRIBUICAO_MOBILEMED=real`);
    }
  }

  if (erros.length) throw new Error(`Variáveis de ambiente inválidas:\n- ${erros.join('\n- ')}`);
  return env;
}
