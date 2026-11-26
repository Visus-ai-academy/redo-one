-- Avisos vistos pelo demonstrativo de faturamento. Laudo sem preço impede fechar a competência
-- (decisão do usuário de 26/11/2026); sem tipificação e arranjo incompleto também, como os outros
-- que afetam o faturamento (o usuário pode desligar em Configurações › Avisos).
INSERT INTO "tipos_aviso" ("tipo", "impede_fechar_competencia") VALUES
  ('laudo_sem_preco', true),
  ('laudo_sem_tipificacao', true),
  ('laudo_arranjo_incompleto', true)
ON CONFLICT ("tipo") DO NOTHING;
