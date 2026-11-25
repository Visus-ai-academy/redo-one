-- Revisão do histórico por vigência da tipificação: a versão inicial (a que a 0064 criou a partir
-- da configuração de antes, ou a carga do dashboards-one) não tem início, como nos preços: vale
-- para toda competência até a próxima versão. É a primeira versão de cada dono que não nasceu pela
-- tela (sem evento "criada" na auditoria). Idempotente.
update "clientes_tipificacao_versoes" v set "vigencia_desde" = null
where v."vigencia_desde" is not null
  and not exists (
    select 1 from "eventos_auditoria" e
    where e."entidade" = 'cliente_tipificacao_versao' and e."entidade_id" = v."id"::text and e."acao" = 'criada'
  )
  and not exists (
    select 1 from "clientes_tipificacao_versoes" o
    where o."cliente_id" = v."cliente_id" and (o."vigencia_desde" is null or o."vigencia_desde" < v."vigencia_desde")
  );
--> statement-breakpoint
update "regras_tipificacao_fatura" v set "vigencia_desde" = null
where v."vigencia_desde" is not null
  and not exists (
    select 1 from "eventos_auditoria" e
    where e."entidade" = 'regra_tipificacao_fatura' and e."entidade_id" = v."id"::text and e."acao" = 'criada'
  )
  and not exists (
    select 1 from "regras_tipificacao_fatura" o
    where o."regra_id" = v."regra_id" and (o."vigencia_desde" is null or o."vigencia_desde" < v."vigencia_desde")
  );
--> statement-breakpoint
update "subregras_tipificacao_fatura" v set "vigencia_desde" = null
where v."vigencia_desde" is not null
  and not exists (
    select 1 from "eventos_auditoria" e
    where e."entidade" = 'subregra_tipificacao_fatura' and e."entidade_id" = v."id"::text and e."acao" = 'criada'
  )
  and not exists (
    select 1 from "subregras_tipificacao_fatura" o
    where o."subregra_id" = v."subregra_id" and (o."vigencia_desde" is null or o."vigencia_desde" < v."vigencia_desde")
  );
