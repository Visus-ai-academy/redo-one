-- Parâmetros do repasse com os valores que o dashboards-one tinha fixos no código ou no singleton
-- `configuracao`, valendo desde sempre (0001-01): tarifa do Peer Review R$ 21 e do Plantão R$ 350,
-- duplicados pagos, vencimento no dia 20 e corte da antecipação no dia 15 do mês seguinte, e as
-- categorias financeiras de sócio e não sócio. O contratado do registro vem da carga (ou da tela).
INSERT INTO "parametros_repasse" (
  "vigencia_desde", "tarifa_peer_review_centavos", "tarifa_plantao_centavos", "paga_duplicados",
  "dia_vencimento", "dia_corte_antecipacao", "categoria_financeira_socio",
  "categoria_financeira_nao_socio"
) VALUES ('0001-01', 2100, 35000, true, 20, 15, 'Radiologistas/Sócios', 'Radiologistas/Terceiros')
ON CONFLICT ("vigencia_desde") DO NOTHING;
--> statement-breakpoint
-- Faixas padrão da lista de exames em atraso (20/30/40/50 exames → R$ 200/300/400/500).
INSERT INTO "faixas_lista_atraso_padrao" ("parametros_id", "exames", "valor_centavos")
SELECT p."id", f."exames", f."valor_centavos"
FROM "parametros_repasse" p,
  (VALUES (20, 20000), (30, 30000), (40, 40000), (50, 50000)) AS f("exames", "valor_centavos")
WHERE p."vigencia_desde" = '0001-01'
ON CONFLICT DO NOTHING;
