ALTER TABLE "ajustes_dia_distribuicao_prioridades" DROP CONSTRAINT "ajustes_dia_distribuicao_prioridades_prioridade_id_prioridades_id_fk";
--> statement-breakpoint
ALTER TABLE "arranjos_prioridades" DROP CONSTRAINT "arranjos_prioridades_prioridade_id_prioridades_id_fk";
--> statement-breakpoint
ALTER TABLE "alocacoes_prioridades" DROP CONSTRAINT "alocacoes_prioridades_prioridade_id_prioridades_id_fk";
--> statement-breakpoint
ALTER TABLE "ajustes_dia_distribuicao_prioridades" ADD CONSTRAINT "ajustes_dia_distribuicao_prioridades_prioridade_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_prioridades" ADD CONSTRAINT "arranjos_prioridades_prioridade_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes_prioridades" ADD CONSTRAINT "alocacoes_prioridades_prioridade_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE no action ON UPDATE no action;