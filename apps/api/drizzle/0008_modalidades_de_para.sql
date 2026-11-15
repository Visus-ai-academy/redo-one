CREATE TABLE "modalidades_de_para" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origem" text NOT NULL,
	"modalidade_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modalidades_de_para_origem_unique" UNIQUE("origem")
);
--> statement-breakpoint
ALTER TABLE "modalidades_de_para" ADD CONSTRAINT "modalidades_de_para_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modalidades_de_para_modalidade_idx" ON "modalidades_de_para" USING btree ("modalidade_id");