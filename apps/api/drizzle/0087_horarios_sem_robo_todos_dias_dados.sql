-- Custom SQL migration file, put your code below! --
-- "Todos os dias" explícito no horário sem robô (25/11/2026): a lista de dias vazia, que até aqui
-- queria dizer "todos os dias", vira todos_dias = true. O comportamento não muda.
UPDATE "regras_frente_horarios_sem_robo" SET "todos_dias" = true WHERE cardinality("dias_semana") = 0;
