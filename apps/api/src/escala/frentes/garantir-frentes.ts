import { and, eq, inArray, notExists, or } from 'drizzle-orm';

import type { Database } from '../../database/database';
import {
  alocacoes,
  ausenciasFrentes,
  frentesEscala,
  turnosFrentes,
  usuariosEscoposEscala,
} from '../../database/schema';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Itens do catálogo que viram frentes. */
export interface DestinosFrentes {
  especialidadeIds: readonly string[];
  modalidadeIds: readonly string[];
}

/**
 * Devolve (ordenados) os ids das frentes dessas especialidades e modalidades, criando as que
 * faltam. Roda na transação de quem chama. Sob concorrência, o `on conflict do nothing` espera a
 * outra transação e não duplica; o select seguinte já enxerga a frente que ela gravou.
 */
export async function garantirFrentes(
  tx: Database | Transacao,
  { especialidadeIds, modalidadeIds }: DestinosFrentes,
): Promise<string[]> {
  const especialidades = [...new Set(especialidadeIds)];
  const modalidades = [...new Set(modalidadeIds)];
  if (!especialidades.length && !modalidades.length) return [];

  await tx
    .insert(frentesEscala)
    .values([
      ...especialidades.map((especialidadeId) => ({
        tipo: 'especialidade' as const,
        especialidadeId,
      })),
      ...modalidades.map((modalidadeId) => ({ tipo: 'modalidade' as const, modalidadeId })),
    ])
    .onConflictDoNothing();

  const linhas = await tx
    .select({ id: frentesEscala.id })
    .from(frentesEscala)
    .where(
      or(
        especialidades.length ? inArray(frentesEscala.especialidadeId, especialidades) : undefined,
        modalidades.length ? inArray(frentesEscala.modalidadeId, modalidades) : undefined,
      ),
    );
  return linhas.map((l) => l.id).sort();
}

/**
 * Apaga, entre essas frentes, as que ficaram sem referência (nenhum turno, alocação, ausência ou
 * recorte de gestora). A frente é só uma chave interna; órfã, apareceria no recorte e nas listas.
 * Roda na transação de quem chama, depois de desligar as frentes do turno.
 */
export async function apagarFrentesOrfas(
  tx: Database | Transacao,
  frenteIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(frenteIds)];
  if (!ids.length) return;
  await tx
    .delete(frentesEscala)
    .where(
      and(
        inArray(frentesEscala.id, ids),
        notExists(
          tx.select().from(turnosFrentes).where(eq(turnosFrentes.frenteId, frentesEscala.id)),
        ),
        notExists(tx.select().from(alocacoes).where(eq(alocacoes.frenteId, frentesEscala.id))),
        notExists(
          tx.select().from(ausenciasFrentes).where(eq(ausenciasFrentes.frenteId, frentesEscala.id)),
        ),
        notExists(
          tx
            .select()
            .from(usuariosEscoposEscala)
            .where(eq(usuariosEscoposEscala.frenteId, frentesEscala.id)),
        ),
      ),
    );
}
