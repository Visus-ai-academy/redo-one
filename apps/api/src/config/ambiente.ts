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

  if (erros.length) throw new Error(`Variáveis de ambiente inválidas:\n- ${erros.join('\n- ')}`);
  return env;
}
