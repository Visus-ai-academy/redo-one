CREATE TABLE "medicos_contas_mobilemed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"id_mobilemed" integer NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicos_contas_mobilemed_id_mobilemed_unique" UNIQUE("id_mobilemed")
);
--> statement-breakpoint
ALTER TABLE "designacoes" ADD COLUMN "recolhido_de_id_mobilemed" integer;--> statement-breakpoint
ALTER TABLE "medicos_contas_mobilemed" ADD CONSTRAINT "medicos_contas_mobilemed_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medicos_contas_mobilemed_medico_idx" ON "medicos_contas_mobilemed" USING btree ("medico_id");