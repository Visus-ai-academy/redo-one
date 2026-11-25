-- Uma linha por tipo de aviso. Responsáveis vazios (o usuário configura em Configurações › Avisos);
-- "impede fechar a competência" ligado nos que afetam o faturamento: cliente desconhecido,
-- estudo desconhecido e preço repetido com valores diferentes (o usuário pode desligar).
INSERT INTO "tipos_aviso" ("tipo", "impede_fechar_competencia") VALUES
  ('cliente', true),
  ('medico', false),
  ('estudo', true),
  ('modalidade', false),
  ('especialidade', false),
  ('prioridade', false),
  ('prioridade_operacao', false),
  ('conta_unidade', false),
  ('cliente_ambiguo', false),
  ('preco_repetido', true),
  ('catalogo_criado_carga', false)
ON CONFLICT ("tipo") DO NOTHING;
--> statement-breakpoint
-- Os avisos de antes eram da importação, menos os vistos pela rodada da distribuição.
UPDATE "avisos_cadastro" SET "origem" = 'rodada' WHERE "tipo" IN ('prioridade_operacao', 'conta_unidade');
