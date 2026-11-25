import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import type { RecortesRodada } from './entrada';

/**
 * A gestora de escala com recorte (`usuarios_escopos_escala`: turnos OU frentes) só mexe na rodada
 * que fica dentro dele. A rodada admite o plantão que está num turno E numa frente dela (com o
 * "todos" explícito); o escopo admite o plantão que está num turno OU numa frente dele. Logo a rodada cabe no
 * escopo quando todos os turnos dela são do escopo, ou todas as frentes; e médico incluído escapa
 * dos dois recortes, então a gestora com escopo não inclui médico.
 */
export interface EscopoGestora {
  turnoIds: ReadonlySet<string>;
  frenteIds: ReadonlySet<string>;
}

export class RecorteForaDoEscopoError extends ErroDeDominio {
  readonly tipo = 'proibido';
}

const contido = (todos: boolean, ids: readonly string[], escopo: ReadonlySet<string>) =>
  !todos && ids.length > 0 && ids.every((id) => escopo.has(id));

export function rodadaNoEscopo(escopo: EscopoGestora | null, r: RecortesRodada): boolean {
  if (!escopo) return true;
  if (r.medicosIncluidos.length) return false;
  return (
    contido(r.todosTurnos, r.turnoIds, escopo.turnoIds) ||
    contido(r.todasFrentes, r.frenteIds, escopo.frenteIds)
  );
}

/**
 * O recorte pedido pela gestora; com "todos os turnos" e "todas as frentes", o escopo dela quando
 * dá para dizer.
 */
export function recorteDaGestora(escopo: EscopoGestora | null, r: RecortesRodada): RecortesRodada {
  if (!escopo) return r;
  if (r.medicosIncluidos.length) {
    throw new RecorteForaDoEscopoError(
      'Com recorte na escala, não dá para incluir médico fora dos turnos e frentes da rodada.',
    );
  }
  let pedido = r;
  if (r.todosTurnos && r.todasFrentes) {
    if (escopo.turnoIds.size && !escopo.frenteIds.size) {
      pedido = { ...r, todosTurnos: false, turnoIds: [...escopo.turnoIds] };
    } else if (escopo.frenteIds.size && !escopo.turnoIds.size) {
      pedido = { ...r, todasFrentes: false, frenteIds: [...escopo.frenteIds] };
    } else {
      throw new RecorteForaDoEscopoError(
        'Escolha os turnos ou as frentes do seu recorte na escala para iniciar a rodada.',
      );
    }
  }
  if (!rodadaNoEscopo(escopo, pedido)) {
    throw new RecorteForaDoEscopoError(
      'A rodada sai do seu recorte na escala: escolha só turnos ou só frentes dele.',
    );
  }
  return pedido;
}
