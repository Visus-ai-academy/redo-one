import { ConflitoEscalaError, EscalaInvalidaError } from '../domain/errors';
import { cabeNoTurno, type FaixaHorario, normalizarHorario } from '../domain/horario';

/** `fixo`: Manhã, Tarde, Plantão. `lista`: a Lista de 24 h, com gratificação e regra própria. */
export type TipoTurno = 'fixo' | 'lista';

export interface DadosTurno extends FaixaHorario {
  nome: string;
  tipo: TipoTurno;
  /** As frentes (colunas da escala) do turno, ordenadas e sem repetição. */
  frenteIds: string[];
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
}

/** Alocação que ainda vale (sem fim ou com fim de hoje em diante) num turno. */
export interface AlocacaoVigente extends FaixaHorario {
  frenteId: string;
  /** Cota do período na Lista; só existe em turno do tipo `lista`. */
  gratificado: boolean;
}

/** Apara os textos, normaliza os horários ("7:00" → "07:00") e ordena as frentes. */
export function normalizarTurno(dados: DadosTurno): DadosTurno {
  const nome = dados.nome.trim();
  if (!nome) throw new EscalaInvalidaError('Informe o nome do turno.');
  return {
    ...dados,
    nome,
    horarioInicio: normalizarHorario(dados.horarioInicio),
    horarioFim: normalizarHorario(dados.horarioFim),
    frenteIds: [...new Set(dados.frenteIds)].sort(),
    descricao: dados.descricao?.trim() || null,
    cor: dados.cor?.trim() || null,
  };
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Mudar o turno não pode deixar alocação vigente órfã: nem gratificada num turno que deixou de ser
 * lista, nem numa frente que saiu do turno, nem fora da nova caixa de horário. O dashboards-one aceitava a mudança e deixava o médico escalado
 * fora do turno.
 */
export function verificarMudancaDoTurno(
  atual: DadosTurno,
  novo: DadosTurno,
  vigentes: readonly AlocacaoVigente[],
  rotulosFrentes: ReadonlyMap<string, string>,
): void {
  if (atual.tipo === 'lista' && novo.tipo !== 'lista') {
    const n = vigentes.filter((a) => a.gratificado).length;
    if (n > 0) {
      throw new ConflitoEscalaError(
        `O turno tem ${n} ${plural(n, 'alocação gratificada vigente', 'alocações gratificadas vigentes')}, e gratificação só existe em turno do tipo lista. Encerre essas alocações antes de mudar o tipo.`,
        { totalAlocacoes: n },
      );
    }
  }

  const ficam = new Set(novo.frenteIds);
  for (const frenteId of atual.frenteIds.filter((id) => !ficam.has(id))) {
    const n = vigentes.filter((a) => a.frenteId === frenteId).length;
    if (n > 0) {
      throw new ConflitoEscalaError(
        `A frente ${rotulosFrentes.get(frenteId) ?? ''} tem ${n} ${plural(n, 'alocação vigente', 'alocações vigentes')} neste turno. Encerre ou mova essas alocações antes de tirá-la do turno.`,
        { totalAlocacoes: n },
      );
    }
  }

  const mudouHorario =
    atual.horarioInicio !== novo.horarioInicio || atual.horarioFim !== novo.horarioFim;
  if (!mudouHorario) return;
  const fora = vigentes.filter((a) => !cabeNoTurno(novo, a)).length;
  if (fora > 0) {
    throw new ConflitoEscalaError(
      `${fora} ${plural(fora, 'alocação vigente ficaria', 'alocações vigentes ficariam')} fora do novo horário do turno (${novo.horarioInicio} às ${novo.horarioFim}). Ajuste ou encerre essas alocações antes de mudar o horário.`,
      { totalAlocacoes: fora },
    );
  }
}
