-- O prazo da Lista (antes uma coluna só para o tipo Lista) vira o prazo próprio de cada turno do
-- tipo Lista, com o mesmo valor: o recolhimento segue igual. Sem configuração salva, nada a copiar.
INSERT INTO "configuracao_distribuicao_recolhimento_turnos" ("turno_id", "minutos")
SELECT "turnos"."id", "configuracao_distribuicao"."recolhimento_apos_lista_min"
FROM "turnos"
CROSS JOIN "configuracao_distribuicao"
WHERE "turnos"."tipo" = 'lista'
ON CONFLICT ("turno_id") DO NOTHING;
