-- Cliente inativo com exames na fila: o robô não os distribui e a leitura da fila abre um aviso por
-- cliente (resolvido sozinho quando o cliente é reativado ou some da fila). Responsáveis vazios
-- (configurados em Configurações › Avisos) e sem travar o fechamento da competência.
INSERT INTO "tipos_aviso" ("tipo", "impede_fechar_competencia") VALUES ('cliente_inativo', false)
ON CONFLICT ("tipo") DO NOTHING;
