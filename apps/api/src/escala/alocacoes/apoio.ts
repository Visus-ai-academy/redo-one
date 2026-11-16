import type { Clock } from '../../identidade/clock';
import {
  AcaoProibidaEscalaError,
  adicionarDias,
  type Data,
  OFFSET_BRASILIA,
  RegistroEscalaNaoEncontradoError,
} from '../domain';
import { type EscopoEscala, type EscopoEscalaRepository, estaNoEscopo } from '../escopo/escopo';
import type { ConflitoEscala, ConsultaOcorrencias } from '../ocorrencias/consulta-ocorrencias';
import type { AlocacaoGravada, AlocacoesRepository } from './alocacoes.repository';
import type { AtorEscala } from './eventos';

/** Quantos dias à frente a resposta de criar/editar procura sobreposição do médico. */
export const JANELA_AVISOS_DIAS = 56;

const OFFSET_MS = Number(OFFSET_BRASILIA.slice(0, 3)) * 60 * 60 * 1000;

/** O dia de hoje no calendário de Brasília. */
export const hojeEmBrasilia = (clock: Clock): Data =>
  new Date(clock.now().getTime() + OFFSET_MS).toISOString().slice(0, 10);

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
 * Sobreposições de horário da alocação com outros plantões do mesmo médico, de hoje (ou do
 * início, se for depois) até `JANELA_AVISOS_DIAS` à frente ou o fim da alocação.
 */
export async function avisosDaAlocacao(
  consulta: ConsultaOcorrencias,
  clock: Clock,
  alocacao: AlocacaoGravada,
): Promise<ConflitoEscala[]> {
  const hoje = hojeEmBrasilia(clock);
  // "YYYY-MM-DD" ordena como texto: o maior entre o início e hoje.
  const de = [alocacao.dataInicio, hoje].sort()[1] ?? hoje;
  const limite = adicionarDias(de, JANELA_AVISOS_DIAS - 1);
  const ate = alocacao.dataFim !== null && alocacao.dataFim < limite ? alocacao.dataFim : limite;
  if (ate < de) return [];
  const { conflitos } = await consulta.listar(de, ate, { medicoId: alocacao.medicoId });
  return conflitos.filter((c) => c.a.alocacaoId === alocacao.id || c.b.alocacaoId === alocacao.id);
}
