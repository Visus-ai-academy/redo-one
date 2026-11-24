-- Dados de faturamento do cliente com chave própria (e-mails da NF, endereço, contato, banco). No
-- dashboards-one ficavam na ficha do cliente: quem vê clientes ganha ver os dados (editar fica com
-- quem receber a chave nova). Idempotente: só insere, com "on conflict do nothing".
insert into "papeis_permissoes" ("papel_id", "permissao")
select pp."papel_id", 'clientes.faturamento.ver'
from "papeis_permissoes" pp
where pp."permissao" = 'clientes.ver'
on conflict do nothing;
