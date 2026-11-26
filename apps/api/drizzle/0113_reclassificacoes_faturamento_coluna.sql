-- O que o dashboards-one tinha fixo no código do faturamento (laudosFaturaveis.ts:594-603) vira a
-- primeira versão, desde sempre, das reclassificações (decisão do usuário de 26/11/2026): coluna
-- laudada por médico da equipe "Neurologistas" é cobrada como NEURO|SC; a dos demais, como
-- MÚSCULO ESQUELÉTICO|COLUNAS. Só se o catálogo e a equipe existirem e a tabela estiver vazia.
WITH ids AS (
  SELECT
    (SELECT id FROM equipes WHERE nome = 'Neurologistas' LIMIT 1) AS equipe,
    (SELECT id FROM categorias_exame WHERE upper(nome) = 'COLUNAS' LIMIT 1) AS colunas,
    (SELECT id FROM categorias_exame WHERE upper(nome) = 'SC' LIMIT 1) AS sc,
    (SELECT id FROM especialidades WHERE upper(nome) = 'NEURO' LIMIT 1) AS neuro,
    (SELECT id FROM especialidades
      WHERE upper(translate(nome, 'ÚÉúé', 'UEue')) = 'MUSCULO ESQUELETICO' LIMIT 1) AS msk
), pode AS (
  SELECT * FROM ids
  WHERE equipe IS NOT NULL AND colunas IS NOT NULL AND sc IS NOT NULL AND neuro IS NOT NULL
    AND msk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reclassificacoes_faturamento)
), regras AS (
  INSERT INTO reclassificacoes_faturamento
    (ordem, descricao, todas_modalidades, todas_especialidades, todas_categorias, todos_medicos,
     especialidade_destino_id, categoria_destino_id)
  SELECT 1, 'Coluna laudada por neurologista é cobrada como NEURO|SC', true, true, false, false, neuro, sc FROM pode
  UNION ALL
  SELECT 2, 'Coluna dos demais médicos é cobrada como MÚSCULO ESQUELÉTICO|COLUNAS', true, true, false, true, msk, colunas FROM pode
  RETURNING id, ordem
)
INSERT INTO reclassificacoes_faturamento_recortes (reclassificacao_id, categoria_id, equipe_id)
SELECT r.id, p.colunas, NULL FROM regras r, pode p
UNION ALL
SELECT r.id, NULL, p.equipe FROM regras r, pode p WHERE r.ordem = 1;
