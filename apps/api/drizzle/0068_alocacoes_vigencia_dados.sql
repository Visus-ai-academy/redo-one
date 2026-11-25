-- A vigência da alocação deixa de sair de ter ou não `data_fim`. Sem fim é escala fixa. Com fim é
-- período, exceto a fixa que foi encerrada depois (pela grade "Montar escala do médico" ou pela
-- carga do dashboards-one): o evento `encerrado` dela guarda que antes não tinha fim. Idempotente:
-- só preenche o que ainda está vazio.
update "alocacoes" a
set "vigencia" = case
  when a."data_fim" is null then 'fixa'::"vigencia_alocacao"
  when exists (
    select 1 from "eventos_auditoria" e
    where e."entidade" = 'alocacao'
      and e."entidade_id" = a."id"::text
      and e."acao" = 'encerrado'
      and e."antes" -> 'dataFim' = 'null'::jsonb
  ) then 'fixa'::"vigencia_alocacao"
  else 'periodo'::"vigencia_alocacao"
end
where a."vigencia" is null;
