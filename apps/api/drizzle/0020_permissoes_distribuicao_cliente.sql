-- Aba Distribuição do cliente com chave própria (só dados). Para ninguém perder acesso: quem vê
-- clientes ganha ver a aba (editar a prioridade fica com quem receber a chave nova). Idempotente:
-- só insere, com "on conflict do nothing".
insert into "papeis_permissoes" ("papel_id", "permissao")
select pp."papel_id", 'clientes.distribuicao.ver'
from "papeis_permissoes" pp
where pp."permissao" = 'clientes.ver'
on conflict do nothing;
