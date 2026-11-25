-- Custom SQL migration file, put your code below! --
-- "Qualquer especialidade" explícito na mistura da frente (25/11/2026): a especialidade nula, que
-- até aqui queria dizer "qualquer", vira todas_especialidades = true. A mistura não muda.
UPDATE "regras_frente_mistura" SET "todas_especialidades" = true WHERE "especialidade_id" IS NULL;
