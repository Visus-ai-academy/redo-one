CREATE TABLE "configuracoes_financeiras" (
	"contratado_id" uuid PRIMARY KEY NOT NULL,
	"faixas_inadimplencia" integer[] NOT NULL,
	"atualizado_por_id" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configuracoes_financeiras" ADD CONSTRAINT "configuracoes_financeiras_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_financeiras" ADD CONSTRAINT "configuracoes_financeiras_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;