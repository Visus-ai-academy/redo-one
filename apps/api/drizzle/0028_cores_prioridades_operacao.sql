-- Cores iniciais das prioridades da operação (dado, editável em Configurações › Distribuição).
-- Só preenche quem ainda não tem cor, casando pelo nome sem acento e sem maiúsculas; rodar de novo
-- não muda nada. Matizes bem separados e pouco saturados, da paleta das outras listas, todos com
-- contraste de pelo menos 3:1 sobre o branco. Prioridade que não está aqui continua neutra.
UPDATE "prioridades_operacao" AS p
SET "cor" = c.cor
FROM (VALUES
	('URGENCIA', '#B5535A'),
	('AMBULATORIO', '#5677B8'),
	('INTERNADO', '#8462A8'),
	('ROTINA', '#5A9A64'),
	('PLANTAO', '#8A8A45')
) AS c(nome, cor)
WHERE p."cor" IS NULL
	AND translate(upper(p."nome"), 'ÁÂÃÀÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC') = c.nome;
