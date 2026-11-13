CREATE TABLE "eventos_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ocorrido_em" timestamp with time zone NOT NULL,
	"ator_tipo" text NOT NULL,
	"ator_id" uuid,
	"entidade" text NOT NULL,
	"entidade_id" text NOT NULL,
	"acao" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb
);
--> statement-breakpoint
CREATE INDEX "eventos_auditoria_entidade_idx" ON "eventos_auditoria" USING btree ("entidade","entidade_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "eventos_auditoria_ator_idx" ON "eventos_auditoria" USING btree ("ator_id","ocorrido_em");