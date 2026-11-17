-- Abas Distribuição e Acesso do médico com chave própria (só dados). Para ninguém perder acesso
-- de uma hora para outra: quem vê médicos ganha ver a distribuição; quem vê médicos e usuários
-- ganha ver o acesso; quem vê médicos e convida ou edita usuários ganha editar o acesso (que
-- implica ver). Idempotente: só insere, com "on conflict do nothing".
insert into "papeis_permissoes" ("papel_id", "permissao")
select pp."papel_id", 'medicos.distribuicao.ver'
from "papeis_permissoes" pp
where pp."permissao" = 'medicos.ver'
on conflict do nothing;
--> statement-breakpoint
insert into "papeis_permissoes" ("papel_id", "permissao")
select distinct pp."papel_id", c."nova"
from "papeis_permissoes" pp
join "papeis_permissoes" medicos
  on medicos."papel_id" = pp."papel_id" and medicos."permissao" = 'medicos.ver'
join (
  values
    ('usuarios.ver', 'medicos.acesso.ver'),
    ('usuarios.criar', 'medicos.acesso.ver'),
    ('usuarios.criar', 'medicos.acesso.editar'),
    ('usuarios.editar', 'medicos.acesso.ver'),
    ('usuarios.editar', 'medicos.acesso.editar')
) as c ("antiga", "nova") on c."antiga" = pp."permissao"
on conflict do nothing;
