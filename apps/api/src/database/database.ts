import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from './schema';

/** Token de injeção do Drizzle. Repositórios recebem com `@Inject(DATABASE) db: Database`. */
export const DATABASE = Symbol('DATABASE');
export const PG_POOL = Symbol('PG_POOL');

export type Database = NodePgDatabase<typeof schema>;
