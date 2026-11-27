-- O fechamento é um só, o do faturamento, e vale para o faturamento e o repasse: a permissão
-- `repasse.fechar` saiu do catálogo. Tira-a dos papéis que a receberam. Idempotente.
delete from "papeis_permissoes" where "permissao" = 'repasse.fechar';
