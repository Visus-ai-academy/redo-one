-- Decisão do usuário (LGPD): ninguém vê os dados de faturamento do cliente por padrão. Desfaz a
-- concessão da 0052 (quem via clientes ganhou `clientes.faturamento.ver`). Quem tem o editar
-- continua vendo: o editar implica o ver (a forma normalizada do papel guarda só o editar).
-- Idempotente.
delete from "papeis_permissoes" where "permissao" = 'clientes.faturamento.ver';
