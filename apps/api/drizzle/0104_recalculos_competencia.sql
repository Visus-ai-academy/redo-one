CREATE TABLE "recalculos_competencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia" text NOT NULL,
	"contexto" text NOT NULL,
	"motivo" text NOT NULL,
	"solicitado_por_id" uuid NOT NULL,
	"solicitado_em" timestamp with time zone NOT NULL,
	"concluido_em" timestamp with time zone,
	CONSTRAINT "recalculos_competencia_motivo_check" CHECK (btrim("recalculos_competencia"."motivo") <> ''),
	CONSTRAINT "recalculos_competencia_contexto_check" CHECK ("recalculos_competencia"."contexto" in ('faturamento', 'repasse'))
);
--> statement-breakpoint
ALTER TABLE "recalculos_competencia" ADD CONSTRAINT "recalculos_competencia_competencia_competencias_competencia_fk" FOREIGN KEY ("competencia") REFERENCES "public"."competencias"("competencia") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalculos_competencia" ADD CONSTRAINT "recalculos_competencia_solicitado_por_id_usuarios_id_fk" FOREIGN KEY ("solicitado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recalculos_competencia_competencia_idx" ON "recalculos_competencia" USING btree ("competencia","solicitado_em");