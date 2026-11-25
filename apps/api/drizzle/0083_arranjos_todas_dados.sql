-- Custom SQL migration file, put your code below! --
-- "Todas" explícito nos arranjos (25/11/2026): o eixo da frente sem linhas, que até aqui queria
-- dizer "todas", vira todas = true. O comportamento de cada arranjo não muda.
UPDATE "arranjos" a SET "todas_especialidades" = true
WHERE a."modalidade_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "arranjos_especialidades" e WHERE e."arranjo_id" = a."id");--> statement-breakpoint
UPDATE "arranjos" a SET "todas_modalidades" = true
WHERE a."especialidade_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "arranjos_modalidades" m WHERE m."arranjo_id" = a."id");--> statement-breakpoint
UPDATE "arranjos" a SET "todos_segmentos" = true
WHERE a."especialidade_id" IS NOT NULL
  AND NOT a."subespecialidade_geral"
  AND NOT EXISTS (SELECT 1 FROM "arranjos_subespecialidades" s WHERE s."arranjo_id" = a."id");--> statement-breakpoint
UPDATE "arranjos" a SET "todas_prioridades" = true
WHERE NOT EXISTS (SELECT 1 FROM "arranjos_prioridades" p WHERE p."arranjo_id" = a."id");--> statement-breakpoint
-- "Todos, exceto nenhum" era "todos": vira o modo "todos".
UPDATE "arranjos" a SET "modo_clientes" = 'todos'
WHERE a."modo_clientes" = 'exceto'
  AND NOT EXISTS (SELECT 1 FROM "arranjos_clientes" c WHERE c."arranjo_id" = a."id");--> statement-breakpoint
UPDATE "arranjos" a SET "modo_exames" = 'todos'
WHERE a."modo_exames" = 'exceto'
  AND NOT EXISTS (SELECT 1 FROM "arranjos_exames" x WHERE x."arranjo_id" = a."id");
