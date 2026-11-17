import type { Arranjo, DonoArranjo } from '../../domain/arranjo';

export const ARRANJOS_REPOSITORY = Symbol('ARRANJOS_REPOSITORY');

export interface Dono {
  tipo: DonoArranjo;
  id: string;
}

export interface ArranjosRepository {
  /** Os arranjos do dono, na ordem do cadastro. */
  listar(dono: Dono): Promise<Arranjo[]>;
  /** Troca a lista inteira do dono numa transação (a ordem da lista vira a ordem do cadastro). */
  substituir(dono: Dono, arranjos: Arranjo[]): Promise<void>;
}
