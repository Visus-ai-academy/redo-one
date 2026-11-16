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

  if (erros.length) throw new Error(`Variáveis de ambiente inválidas:\n- ${erros.join('\n- ')}`);
  return env;
}
