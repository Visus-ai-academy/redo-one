-- Carga única: o contratado padrão (a TeleImagem, hoje a única empresa no financeiro do One)
-- passa a usar o financeiro do One. Daqui em diante isso se troca na tela Configurações ›
-- Contratados. Só quando há exatamente um padrão e ele está ativo; senão nenhum fica marcado.
UPDATE "contratados"
SET "usa_financeiro" = true
WHERE "padrao"
  AND "ativo"
  AND (SELECT count(*) FROM "contratados" WHERE "padrao") = 1;
