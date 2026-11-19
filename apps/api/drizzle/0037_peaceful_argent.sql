ALTER TABLE "importacoes" ALTER COLUMN "arquivo_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parametros_ingestao" ADD COLUMN "mobilemed_intervalo_minutos" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "parametros_ingestao" ADD COLUMN "mobilemed_meses_anteriores" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "parametros_ingestao" ADD COLUMN "mobilemed_janela_dias" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "parametros_ingestao" ADD COLUMN "mobilemed_teto" integer DEFAULT 50000 NOT NULL;--> statement-breakpoint
CREATE INDEX "importacoes_origem_criada_idx" ON "importacoes" USING btree ("origem","criado_em");--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_fonte_check" CHECK (("importacoes"."origem" = 'upload_manual') = ("importacoes"."arquivo_id" is not null));