-- Tipos de aviso do repasse. Responsáveis vazios (o usuário configura em Configurações › Avisos).
-- "Impede fechar a competência" ligado nos dois: laudo sem preço de repasse (decisão do usuário,
-- 26/11/2026) e preço de repasse repetido com valores diferentes (como o preço repetido do
-- faturamento); o usuário pode desligar.
INSERT INTO "tipos_aviso" ("tipo", "impede_fechar_competencia") VALUES
  ('repasse_sem_preco', true),
  ('preco_repasse_repetido', true)
ON CONFLICT ("tipo") DO NOTHING;
