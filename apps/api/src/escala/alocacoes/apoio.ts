import type { Clock } from '../../identidade/clock';
import {
  AcaoProibidaEscalaError,
  adicionarDias,
  caiNoDia,
  type Data,
  diaDaSemana,
  diaEmBrasilia,
  RegistroEscalaNaoEncontradoError,
} from '../domain';
import { type EscopoEscala, type EscopoEscalaRepository, estaNoEscopo } from '../escopo/escopo';
import type {
  ConflitoEscala,
  ConsultaOcorrencias,
  PlantaoEmConflito,
} from '../ocorrencias/consulta-ocorrencias';
import type { AlocacaoGravada, AlocacoesRepository } from './alocacoes.repository';
import type { AtorEscala } from './eventos';

/** Quantos dias à frente a resposta de criar/editar procura sobreposição do médico. */
export const JANELA_AVISOS_DIAS = 56;

/** O dia de hoje no calendário de Brasília. */
export const hojeEmBrasilia = (clock: Clock): Data => diaEmBrasilia(clock.now());

export async function escopoDo(
  escopos: EscopoEscalaRepository,
  ator: AtorEscala,
): Promise<EscopoEscala | null> {
  return ator.acessoTotal ? null : escopos.doUsuario(ator.usuarioId);
}

/** A alocação, se existir e estiver no recorte (fora dele, para a gestora, ela não existe). */
export async function alocacaoNoEscopo(
  repo: AlocacoesRepository,
  escopo: EscopoEscala | null,
  id: string,
): Promise<AlocacaoGravada> {
  const alocacao = await repo.buscar(id);
  if (!alocacao || !estaNoEscopo(escopo, alocacao)) {
    throw new RegistroEscalaNaoEncontradoError('Alocação não encontrada.');
  }
  return alocacao;
}

/**
 * O dia é de plantão do vínculo? Na cobertura: dia e período dela, e plantão do titular naquele
 * dia. Usado pelos ajustes do dia (produtividade na escala, prioridades na distribuição).
 */
export async function ehDiaDePlantao(
  repo: Pick<AlocacoesRepository, 'buscar'>,
  alocacao: AlocacaoGravada,
  dia: Data,
): Promise<boolean> {
  if (alocacao.coberturaDeId === null) return caiNoDia(alocacao, dia);
  const titular = await repo.buscar(alocacao.coberturaDeId);
  return (
    titular !== null &&
    dia >= alocacao.dataInicio &&
    (alocacao.dataFim === null || dia <= alocacao.dataFim) &&
    alocacao.diasSemana.includes(diaDaSemana(dia)) &&
    caiNoDia(titular, dia)
  );
}

export function exigirNoEscopo(
  escopo: EscopoEscala | null,
  alvo: { turnoId: string; frenteId: string },
) {
  if (!estaNoEscopo(escopo, alvo)) {
    throw new AcaoProibidaEscalaError(
      'Este turno e esta frente estão fora do seu recorte da escala.',
    );
  }
}

/**
 * Uma ponta do aviso. Dentro do recorte de quem grava: o plantão inteiro e `foraDoRecorte: false`.
 * Fora dele: só `foraDoRecorte: true` e a data (a gestora não vê turno, frente, horário nem id).
 */
export type PlantaoDoAviso =
  | (PlantaoEmConflito & { foraDoRecorte: false })
  | { foraDoRecorte: true; data: string };

/** Sobreposição de horário do médico, com a ponta de fora do recorte sem detalhes. */
export interface AvisoConflito extends Omit<ConflitoEscala, 'a' | 'b'> {
  a: PlantaoDoAviso;
  b: PlantaoDoAviso;
}

const pontaDoAviso = (escopo: EscopoEscala | null, p: PlantaoEmConflito): PlantaoDoAviso =>
  estaNoEscopo(escopo, p) ? { ...p, foraDoRecorte: false } : { foraDoRecorte: true, data: p.data };

/**
 * Sobreposições de horário da alocação com outros plantões do mesmo médico, de hoje (ou do
 * início, se for depois) até `JANELA_AVISOS_DIAS` à frente ou o fim da alocação. A consulta traz
 * também o plantão do dia anterior que vira a meia-noite. Procura em toda a escala do médico, mas
 * a ponta fora do `escopo` de quem grava vem sem detalhes.
 */
export async function avisosDaAlocacao(
  consulta: ConsultaOcorrencias,
  clock: Clock,
  alocacao: AlocacaoGravada,
  escopo: EscopoEscala | null,
): Promise<AvisoConflito[]> {
  const hoje = hojeEmBrasilia(clock);
  // "YYYY-MM-DD" ordena como texto: o maior entre o início e hoje.
  const de = [alocacao.dataInicio, hoje].sort()[1] ?? hoje;
  const limite = adicionarDias(de, JANELA_AVISOS_DIAS - 1);
  const ate = alocacao.dataFim !== null && alocacao.dataFim < limite ? alocacao.dataFim : limite;
  if (ate < de) return [];
  const { conflitos } = await consulta.listar(de, ate, { medicoId: alocacao.medicoId });
  return conflitos
    .filter((c) => c.a.alocacaoId === alocacao.id || c.b.alocacaoId === alocacao.id)
    .map((c) => ({ ...c, a: pontaDoAviso(escopo, c.a), b: pontaDoAviso(escopo, c.b) }));
}
