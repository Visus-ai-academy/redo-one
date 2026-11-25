ALTER TABLE "cortes_competencia" ADD CONSTRAINT "cortes_competencia_exame_dia_check" CHECK ("cortes_competencia"."exame_dia" between 1 and 31);--> statement-breakpoint
ALTER TABLE "cortes_competencia" ADD CONSTRAINT "cortes_competencia_exame_mes_check" CHECK ("cortes_competencia"."exame_mes" in ('proprio', 'seguinte'));--> statement-breakpoint
ALTER TABLE "cortes_competencia" ADD CONSTRAINT "cortes_competencia_exame_check" CHECK (case when "cortes_competencia"."usa_padrao"
        then "cortes_competencia"."exame_dia" is null and not "cortes_competencia"."exame_ultimo_dia" and "cortes_competencia"."exame_mes" is null
        else "cortes_competencia"."exame_mes" is not null and ("cortes_competencia"."exame_dia" is not null) <> "cortes_competencia"."exame_ultimo_dia"
      end);