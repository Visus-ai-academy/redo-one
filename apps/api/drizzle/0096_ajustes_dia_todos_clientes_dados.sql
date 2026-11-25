-- Custom SQL migration file, put your code below! --
-- "Todos os clientes" explícito no ajuste do dia (25/11/2026): o cliente nulo, que até aqui queria
-- dizer "todos", vira todos_clientes = true. O comportamento de cada ajuste não muda.
UPDATE "ajustes_dia_distribuicao" SET "todos_clientes" = true WHERE "cliente_id" IS NULL;
