const DIA = 24 * 60 * 60 * 1000;

/** Sem uso por este tempo, a sessão expira. Renovada a cada uso. */
export const SESSAO_INATIVIDADE_MS = 7 * DIA;
/** Limite absoluto a partir do login: depois disso, só entrando de novo. */
export const SESSAO_LIMITE_ABSOLUTO_MS = 30 * DIA;
/** Usos mais próximos que isto não regravam a sessão (evita um UPDATE por requisição). */
export const SESSAO_RENOVACAO_MINIMA_MS = 60 * 1000;
