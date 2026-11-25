-- Custom SQL migration file, put your code below! --
-- "Todos" explícito nos recortes da rodada (25/11/2026): o eixo vazio, que até aqui queria dizer
-- "sem recorte", vira o "todos" explícito. O que cada rodada gravada pediu não muda.
UPDATE "rodadas" SET "todos_turnos" = true WHERE cardinality("turno_ids") = 0;--> statement-breakpoint
UPDATE "rodadas" SET "todas_frentes" = true WHERE cardinality("frente_ids") = 0;--> statement-breakpoint
UPDATE "rodadas" SET "todas_prioridades" = true WHERE cardinality("prioridade_operacao_ids") = 0;--> statement-breakpoint
UPDATE "rodadas" SET "todos_segmentos" = true
WHERE cardinality("subespecialidade_ids") = 0 AND NOT "subespecialidade_geral";--> statement-breakpoint
UPDATE "rodadas" SET "todos_clientes" = true WHERE cardinality("cliente_ids") = 0;
