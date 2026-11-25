-- Custom SQL migration file, put your code below! --
-- "Todas" explícito nas alocações (25/11/2026): o recorte vazio, que até aqui queria dizer "toda
-- semana" / "sem restrição", vira todas = true. O comportamento de cada alocação não muda.
UPDATE "alocacoes" SET "todas_semanas" = true WHERE cardinality("semanas_do_mes") = 0;--> statement-breakpoint
UPDATE "alocacoes" a SET "todas_prioridades" = true
WHERE NOT EXISTS (SELECT 1 FROM "alocacoes_prioridades" p WHERE p."alocacao_id" = a."id");--> statement-breakpoint
UPDATE "alocacoes" a SET "todos_segmentos" = true
WHERE NOT a."subespecialidade_geral"
  AND NOT EXISTS (SELECT 1 FROM "alocacoes_subespecialidades" s WHERE s."alocacao_id" = a."id");
