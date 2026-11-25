-- O arranjo passa a ter frente explícita: especialidade OU modalidade. Com especialidade, nada
-- muda (as modalidades marcadas são o recorte dela). Sem especialidade e com uma modalidade só
-- ("faz todo RX"), vira frente dessa modalidade com todas as especialidades: o mesmo casamento.
-- Sem especialidade e com 0 ou 2+ modalidades, ou com segmento, não há frente que dê o mesmo
-- recorte: a migração para, para alguém decidir à mão (não havia nenhum no dashboards-one nem no
-- dev em 25/11/2026). Idempotente: só mexe no que ainda não tem frente.
do $$
declare
  ambiguos text;
begin
  select string_agg(a."id"::text, ', ') into ambiguos
  from "arranjos" a
  where a."especialidade_id" is null and a."modalidade_id" is null
    and (
      (select count(*) from "arranjos_modalidades" m where m."arranjo_id" = a."id") <> 1
      or a."subespecialidade_geral"
      or exists (select 1 from "arranjos_subespecialidades" s where s."arranjo_id" = a."id")
    );
  if ambiguos is not null then
    raise exception 'Arranjos sem frente clara (sem especialidade e sem uma modalidade única): %', ambiguos;
  end if;
end $$;
--> statement-breakpoint
update "arranjos" a
set "modalidade_id" = m."modalidade_id"
from "arranjos_modalidades" m
where m."arranjo_id" = a."id"
  and a."especialidade_id" is null
  and a."modalidade_id" is null;
--> statement-breakpoint
delete from "arranjos_modalidades" m
using "arranjos" a
where m."arranjo_id" = a."id"
  and a."modalidade_id" is not null;
