ALTER TABLE "configuracao_distribuicao_lista_prioridades" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao_urgentes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "regras_frente_lista_prioridades" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "configuracao_distribuicao_lista_prioridades" CASCADE;--> statement-breakpoint
DROP TABLE "configuracao_distribuicao_urgentes" CASCADE;--> statement-breakpoint
DROP TABLE "regras_frente_lista_prioridades" CASCADE;--> statement-breakpoint
ALTER TABLE "ajustes_dia_distribuicao" RENAME COLUMN "lista_segue_sla" TO "segue_sla";--> statement-breakpoint
ALTER TABLE "regras_frente" DROP CONSTRAINT "regras_frente_prazo_check";--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao" DROP COLUMN "lista_prazo_minimo_horas";--> statement-breakpoint
ALTER TABLE "regras_frente" DROP COLUMN "lista_prioridades_propria";--> statement-breakpoint
ALTER TABLE "regras_frente" DROP COLUMN "lista_prazo_proprio";--> statement-breakpoint
ALTER TABLE "regras_frente" DROP COLUMN "lista_prazo_minimo_horas";