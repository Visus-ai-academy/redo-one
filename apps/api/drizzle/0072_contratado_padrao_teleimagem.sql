-- Carga única: a TeleImagem passa a ser o contratado padrão (vem escolhida nos campos de
-- contratado). Daqui em diante o padrão se troca na tela Configurações › Contratados.
-- O legado não registra o CNPJ da TeleImagem: casa pela razão social, e só quando um único
-- contratado casa e ele está ativo; senão não marca nenhum (os campos começam vazios, como antes).
UPDATE "contratados"
SET "padrao" = true
WHERE "razao_social" ILIKE 'TELEIMAGEM%'
  AND "ativo"
  AND (SELECT count(*) FROM "contratados" WHERE "razao_social" ILIKE 'TELEIMAGEM%') = 1
  AND NOT EXISTS (SELECT 1 FROM "contratados" WHERE "padrao");
