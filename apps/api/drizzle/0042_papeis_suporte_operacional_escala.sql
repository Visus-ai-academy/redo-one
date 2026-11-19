-- Papéis Suporte, Operacional e Gestão de escala médica (só dados), auditados como "sistema".
-- A Gestora de Escala só troca o nome (mesmo id e permissões). Suporte nasce sem permissões
-- (definidas pela tela Papéis). O Operacional passa a ver a Distribuição; rodar e aprovar ficam
-- para a tela. Idempotente: só audita o que de fato mudou.
with renomeado as (
  update "papeis" set "nome" = 'Gestão de escala médica'
  where "nome" = 'Gestora de Escala'
    and not exists (select 1 from "papeis" where "nome" = 'Gestão de escala médica')
  returning "id"
)
insert into "eventos_auditoria" ("ocorrido_em", "ator_tipo", "entidade", "entidade_id", "acao", "antes", "depois")
select now(), 'sistema', 'papel', "id"::text, 'alterado',
  '{"nome": "Gestora de Escala"}'::jsonb, '{"nome": "Gestão de escala médica"}'::jsonb
from renomeado;
--> statement-breakpoint
with criados as (
  insert into "papeis" ("nome")
  values ('Suporte'), ('Operacional'), ('Gestão de escala médica')
  on conflict ("nome") do nothing
  returning "id", "nome"
)
insert into "eventos_auditoria" ("ocorrido_em", "ator_tipo", "entidade", "entidade_id", "acao", "antes", "depois")
select now(), 'sistema', 'papel', "id"::text, 'criado', null,
  jsonb_build_object('nome', "nome", 'permissoes', '[]'::jsonb)
from criados;
--> statement-breakpoint
with concedida as (
  insert into "papeis_permissoes" ("papel_id", "permissao")
  select "id", 'distribuicao.ver' from "papeis" where "nome" = 'Operacional'
  on conflict do nothing
  returning "papel_id"
),
-- O select enxerga a tabela de antes do insert: são as permissões anteriores.
anteriores as (
  select c."papel_id",
    coalesce(
      (select jsonb_agg(pp."permissao" order by pp."permissao") from "papeis_permissoes" pp
       where pp."papel_id" = c."papel_id"),
      '[]'::jsonb
    ) as "permissoes"
  from concedida c
)
insert into "eventos_auditoria" ("ocorrido_em", "ator_tipo", "entidade", "entidade_id", "acao", "antes", "depois")
select now(), 'sistema', 'papel', a."papel_id"::text, 'alterado',
  jsonb_build_object('permissoes', a."permissoes"),
  jsonb_build_object('permissoes', (
    select jsonb_agg(p order by p)
    from jsonb_array_elements_text(a."permissoes" || '["distribuicao.ver"]'::jsonb) p
  ))
from anteriores a;
