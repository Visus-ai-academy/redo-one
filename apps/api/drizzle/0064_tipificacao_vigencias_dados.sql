-- Adendo de 25/11/2026 da spec da tipificação: histórico por vigência. A configuração de cada
-- cliente, o "fatura" das sub-regras e o "fatura sem sub-regra" das regras viram a versão inicial,
-- desde a primeira competência dos laudos (ou das competências; sem nenhuma, o mês atual em
-- Brasília). Quem salvou pela tela fica como autor da versão. Idempotente: só copia o que ainda
-- não tem versão.
insert into "clientes_tipificacao_versoes"
  ("cliente_id", "vigencia_desde", "regra_id", "subregra_demais_id", "criado_em", "criado_por_id")
select c."cliente_id",
  coalesce(
    least((select min("competencia") from "laudos"), (select min("competencia") from "competencias")),
    to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  ),
  c."regra_id", c."subregra_demais_id", c."atualizado_em", c."atualizado_por_id"
from "clientes_tipificacao" c
where not exists (
  select 1 from "clientes_tipificacao_versoes" v where v."cliente_id" = c."cliente_id"
);
--> statement-breakpoint
update "clientes_tipificacao_linhas" l
set "versao_id" = v."id"
from "clientes_tipificacao_versoes" v
where v."cliente_id" = l."cliente_id" and l."versao_id" is null;
--> statement-breakpoint
insert into "regras_tipificacao_fatura" ("regra_id", "vigencia_desde", "fatura_sem_subregra")
select r."id",
  coalesce(
    least((select min("competencia") from "laudos"), (select min("competencia") from "competencias")),
    to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  ),
  r."fatura_sem_subregra"
from "regras_tipificacao" r
where not exists (select 1 from "regras_tipificacao_fatura" f where f."regra_id" = r."id");
--> statement-breakpoint
insert into "subregras_tipificacao_fatura" ("subregra_id", "vigencia_desde", "fatura")
select s."id",
  coalesce(
    least((select min("competencia") from "laudos"), (select min("competencia") from "competencias")),
    to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  ),
  s."fatura"
from "subregras_tipificacao" s
where not exists (select 1 from "subregras_tipificacao_fatura" f where f."subregra_id" = s."id");
