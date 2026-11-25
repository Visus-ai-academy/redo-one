ALTER TABLE "cortes_competencia" ADD COLUMN "exame_dia" integer;--> statement-breakpoint
ALTER TABLE "cortes_competencia" ADD COLUMN "exame_ultimo_dia" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cortes_competencia" ADD COLUMN "exame_mes" text;