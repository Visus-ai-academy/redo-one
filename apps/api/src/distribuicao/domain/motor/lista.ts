import { type Horario, minutosDoHorario, minutosEmBrasilia } from './configuracao';

/**
 * A Lista diante dos turnos "posteriores" (os que recebem numa rodada mais tarde no dia). Fonte:
 * dashboards-one `arranjo.ts` `guardaParaTarde` e `tardeAntesDaLista`. Lá o papel era do turno de
 * nome "TARDE" e a cheia, 10:50 fixo no código; aqui os dois vêm da configuração global
 * (`turnosPosteriores`), e a frente é o id da especialidade ou modalidade.
 */

/** Exame da fila, só o que a conta precisa. */
interface ExameDaConta {
  especialidadeId: string | null;
  modalidadeId: string | null;
  restanteMin: number | null;
}

interface ListaDaConta {
  alocacaoId: string;
  /** Id da especialidade ou modalidade da frente. */
  frente: string;
  produtividade: number;
}

/** A frente do exame entre as que têm o mapa: a da especialidade, senão a da modalidade. */
function frenteNoMapa(e: ExameDaConta, mapa: ReadonlyMap<string, unknown>): string | null {
  if (e.especialidadeId !== null && mapa.has(e.especialidadeId)) return e.especialidadeId;
  if (e.modalidadeId !== null && mapa.has(e.modalidadeId)) return e.modalidadeId;
  return null;
}

function totalPorFrente(listas: readonly ListaDaConta[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const l of listas) total.set(l.frente, (total.get(l.frente) ?? 0) + l.produtividade);
  return total;
}

/**
 * Com o ajuste "a Lista segue o SLA", antes da cheia dos turnos posteriores a Lista não leva o
 * exame que vence até o fim deles (corte, em minutos a partir de agora) e recebe a produtividade
 * menos a sua parte do que eles não vão dar conta (reserva), para ter vaga depois.
 *
 *   guardados = fila da frente com prazo até o fim do turno posterior
 *   sobra     = guardados − vaga do posterior (produtividade − em mãos), nunca < 0
 *   reserva   = sobra × produtividade da Lista ÷ produtividade das Listas da frente (para cima)
 */
export function guardaParaPosteriores(args: {
  agora: Date;
  cheiaEm: Horario;
  posterioresNaRodada: boolean;
  posteriores: readonly { frente: string; fim: Date; vaga: number }[];
  listas: readonly ListaDaConta[];
  fila: readonly ExameDaConta[];
}): { corte: Map<string, number>; reserva: Map<string, number> } {
  const corte = new Map<string, number>();
  const reserva = new Map<string, number>();
  if (args.posterioresNaRodada || minutosEmBrasilia(args.agora) >= minutosDoHorario(args.cheiaEm)) {
    return { corte, reserva };
  }
  const vaga = new Map<string, number>();
  for (const t of args.posteriores) {
    const ate = (t.fim.getTime() - args.agora.getTime()) / 60_000;
    corte.set(t.frente, Math.max(corte.get(t.frente) ?? 0, ate));
    vaga.set(t.frente, (vaga.get(t.frente) ?? 0) + t.vaga);
  }
  const guardados = new Map<string, number>();
  for (const e of args.fila) {
    const f = frenteNoMapa(e, corte);
    if (f === null || e.restanteMin === null || e.restanteMin > (corte.get(f) as number)) continue;
    guardados.set(f, (guardados.get(f) ?? 0) + 1);
  }
  const total = totalPorFrente(args.listas);
  for (const l of args.listas) {
    const sobra = Math.max(0, (guardados.get(l.frente) ?? 0) - (vaga.get(l.frente) ?? 0));
    if (sobra > 0 && l.produtividade > 0) {
      reserva.set(
        l.alocacaoId,
        Math.ceil((sobra * l.produtividade) / (total.get(l.frente) as number)),
      );
    }
  }
  return { corte, reserva };
}

/**
 * Nas frentes com "Lista depois dos fixos", a Lista que recebe antes de o turno posterior começar
 * fica só com o que ele não vai dar conta: teto = parte dela (pela produtividade, para baixo) em
 * fila da frente − vaga do posterior. Sem posterior hoje na frente, nada muda.
 */
export function listaDepoisDosFixos(args: {
  agora: Date;
  posterioresNaRodada: boolean;
  frentes: ReadonlySet<string>;
  posteriores: readonly { frente: string; inicio: Date; vaga: number }[];
  listas: readonly ListaDaConta[];
  fila: readonly ExameDaConta[];
}): Map<string, number> {
  const teto = new Map<string, number>();
  if (!args.frentes.size || args.posterioresNaRodada) return teto;
  const vaga = new Map<string, number>();
  for (const t of args.posteriores) {
    if (!args.frentes.has(t.frente) || args.agora.getTime() >= t.inicio.getTime()) continue;
    vaga.set(t.frente, (vaga.get(t.frente) ?? 0) + t.vaga);
  }
  const naFila = new Map<string, number>();
  for (const e of args.fila) {
    const f = frenteNoMapa(e, vaga);
    if (f !== null) naFila.set(f, (naFila.get(f) ?? 0) + 1);
  }
  const total = totalPorFrente(args.listas);
  for (const l of args.listas) {
    const v = vaga.get(l.frente);
    if (v === undefined || l.produtividade <= 0) continue;
    const sobra = Math.max(0, (naFila.get(l.frente) ?? 0) - v);
    teto.set(l.alocacaoId, Math.floor((sobra * l.produtividade) / (total.get(l.frente) as number)));
  }
  return teto;
}
