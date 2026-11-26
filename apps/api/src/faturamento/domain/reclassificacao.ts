import { vigenteEm } from './preco';

/**
 * Reclassificação do arranjo do laudo para o preço, em ordem (a primeira que casa vale): ex.:
 * coluna laudada por médico da equipe "Neurologistas" vira NEURO|SC (no dashboards-one, fixo no
 * código). Recorte nulo = todos; destino nulo mantém o do laudo.
 */
export interface ReclassificacaoFaturamento {
  id: string;
  ordem: number;
  descricao: string;
  modalidadeIds: readonly string[] | null;
  especialidadeIds: readonly string[] | null;
  categoriaIds: readonly string[] | null;
  /** Equipes (grupos de médicos); nulo = todos os médicos. */
  equipeIds: readonly string[] | null;
  especialidadeDestinoId: string | null;
  categoriaDestinoId: string | null;
  /** "YYYY-MM" inclusivos; vazio = sem limite. */
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
}

/** As que valem na competência, pela ordem configurada. */
export function reclassificacoesEm(
  regras: readonly ReclassificacaoFaturamento[],
  competencia: string,
): ReclassificacaoFaturamento[] {
  return regras
    .filter((r) => vigenteEm(r, competencia))
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

const casa = (lista: readonly string[] | null, valor: string | null) =>
  lista === null || (valor !== null && lista.includes(valor));

interface ArranjoParcial {
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
}

/** A primeira reclassificação que casa o arranjo e o médico (pelas equipes dele) muda o arranjo. */
export function reclassificar<T extends ArranjoParcial>(
  arranjo: T,
  medicoId: string | null,
  regras: readonly ReclassificacaoFaturamento[],
  equipesDoMedico: ReadonlyMap<string, ReadonlySet<string>>,
): T {
  const equipes = medicoId ? equipesDoMedico.get(medicoId) : undefined;
  const regra = regras.find(
    (r) =>
      casa(r.modalidadeIds, arranjo.modalidadeId) &&
      casa(r.especialidadeIds, arranjo.especialidadeId) &&
      casa(r.categoriaIds, arranjo.categoriaId) &&
      (r.equipeIds === null || r.equipeIds.some((e) => equipes?.has(e))),
  );
  if (!regra) return arranjo;
  return {
    ...arranjo,
    especialidadeId: regra.especialidadeDestinoId ?? arranjo.especialidadeId,
    categoriaId: regra.categoriaDestinoId ?? arranjo.categoriaId,
  };
}
