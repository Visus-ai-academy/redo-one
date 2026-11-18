-- Cores das subespecialidades, da mesma paleta das especialidades, modalidades e turnos: as da
-- mesma especialidade nunca repetem e todas se distinguem da cor da especialidade (NEURO, roxo;
-- COLUNAS também é MSK, verde-azulado). Cor é dado: muda na tela Classificação dos exames.
-- Idempotente: só preenche a cor que está vazia, sem passar por cima da escolhida na tela.
update "subespecialidades" s
set "cor" = v."cor"
from (values
  ('CRÂNIO', '#4F9BC2'),
  ('ANGIO', '#B5535A'),
  ('CABEÇA E PESCOÇO', '#5A9A64'),
  ('COLUNAS', '#D1A23C')
) as v("nome", "cor")
where s."nome" = v."nome" and s."cor" is null;
