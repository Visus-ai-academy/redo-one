/**
 * Segmento (subespecialidade) é recorte da especialidade: só existe nas especialidades em que foi
 * cadastrado (`subespecialidades_especialidades`; COLUNAS é de NEURO e de MSK). Exame, arranjo,
 * alocação e regras da frente só gravam segmento que a especialidade deles tem. Vale para o que
 * se grava ou muda; o que já está gravado continua sendo lido como está.
 */
export interface Segmento {
  id: string;
  nome: string;
  especialidadeIds: readonly string[];
}

/**
 * O primeiro dos `ids` que a especialidade não tem (null = todos cabem). Sem especialidade,
 * nenhum segmento cabe. Id que não está em `segmentos` é ignorado: a existência é checada à parte.
 */
export function segmentoForaDaEspecialidade(
  segmentos: readonly Segmento[],
  ids: readonly string[],
  especialidadeId: string | null,
): Segmento | null {
  for (const id of ids) {
    const segmento = segmentos.find((s) => s.id === id);
    if (segmento && (!especialidadeId || !segmento.especialidadeIds.includes(especialidadeId))) {
      return segmento;
    }
  }
  return null;
}

/** `onde` completa "na especialidade ...": "do exame", "do arranjo", "desta frente". */
export function mensagemSegmentoFora(segmento: Segmento, onde: string): string {
  return `O segmento ${segmento.nome} não existe na especialidade ${onde}. Escolha um segmento dela ou deixe sem segmento.`;
}
