import { asc, type SQL, sql } from 'drizzle-orm';

import { especialidades, frentesEscala, modalidades } from '../../database/schema';

/**
 * A frente é uma especialidade ou uma modalidade do catálogo: nome, cor, ordem, ativo e descrição
 * vêm de lá. As expressões pedem `left join` de `especialidades` e `modalidades` pelos ids da
 * frente; só um dos dois casa, pelo check da tabela.
 */
export const frenteDoCatalogo = {
  /** Nome da especialidade ou código da modalidade. */
  rotulo: sql<string>`coalesce(${especialidades.nome}, ${modalidades.codigo})`,
  descricao: sql<string | null>`coalesce(${especialidades.descricao}, ${modalidades.descricao})`,
  cor: sql<string | null>`coalesce(${especialidades.cor}, ${modalidades.cor})`,
  ordem: sql<number>`coalesce(${especialidades.ordem}, ${modalidades.ordem})`,
  ativo: sql<boolean>`coalesce(${especialidades.ativo}, ${modalidades.ativo})`,
};

/** Especialidades antes das modalidades; dentro de cada uma, a ordem e o nome do catálogo. */
export const ordemDasFrentes: SQL[] = [
  asc(frentesEscala.tipo),
  asc(frenteDoCatalogo.ordem),
  asc(frenteDoCatalogo.rotulo),
];

/**
 * Para subconsultas em SQL cru com a frente no apelido `f`: os joins (apelidos `fe` e `fm`), o
 * rótulo e a ordem, iguais aos de cima.
 */
export const CATALOGO_DA_FRENTE_F = sql.raw(
  'left join especialidades fe on fe.id = f.especialidade_id left join modalidades fm on fm.id = f.modalidade_id',
);
export const ROTULO_DA_FRENTE_F = sql.raw('coalesce(fe.nome, fm.codigo)');
export const ORDEM_DA_FRENTE_F = sql.raw(
  'f.tipo, coalesce(fe.ordem, fm.ordem), coalesce(fe.nome, fm.codigo)',
);
