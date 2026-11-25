-- Adendo de 25/11/2026 da spec de competência e corte: o corte ganha o período da data do exame.
-- As vigências que já existem (as que não "usam o padrão") ficam com o período de antes, o mês
-- cheio: até o último dia do próprio mês. Nenhuma competência muda. Idempotente.
update "cortes_competencia"
set "exame_ultimo_dia" = true, "exame_mes" = 'proprio'
where not "usa_padrao" and "exame_mes" is null;
