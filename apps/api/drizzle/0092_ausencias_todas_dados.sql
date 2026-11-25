-- Custom SQL migration file, put your code below! --
-- "Todos" explícito na ausência (25/11/2026): o recorte vazio, que até aqui queria dizer "todos os
-- dias", "todas as escalas" ou "o dia inteiro", vira o "todos" explícito. O comportamento não muda.
UPDATE "ausencias" SET "todos_dias" = true WHERE cardinality("dias_semana") = 0;--> statement-breakpoint
UPDATE "ausencias" a SET "todas_frentes" = true
WHERE NOT EXISTS (SELECT 1 FROM "ausencias_frentes" f WHERE f."ausencia_id" = a."id");--> statement-breakpoint
UPDATE "ausencias" a SET "todos_turnos" = true
WHERE NOT EXISTS (SELECT 1 FROM "ausencias_turnos" t WHERE t."ausencia_id" = a."id");
