-- Custom SQL migration file, put your code below! --
-- "Todas" explícito nas exceções de recebimento (25/11/2026): a frente e a prioridade nulas, que até
-- aqui queriam dizer "todas", viram todas = true. O comportamento de cada exceção não muda.
UPDATE "excecoes_recebimento" SET "todas_frentes" = true
WHERE "especialidade_id" IS NULL AND "modalidade_id" IS NULL;--> statement-breakpoint
UPDATE "excecoes_recebimento" SET "todas_prioridades" = true WHERE "prioridade_operacao_id" IS NULL;
