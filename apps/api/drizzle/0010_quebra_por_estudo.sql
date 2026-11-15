CREATE TABLE "quebras_estudo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estudo_origem" text NOT NULL,
	"chave_normalizada" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quebras_estudo_chave_normalizada_unique" UNIQUE("chave_normalizada")
);
--> statement-breakpoint
CREATE TABLE "quebras_estudo_pecas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quebra_id" uuid NOT NULL,
	"exame_id" uuid NOT NULL,
	"categoria_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quebras_estudo_pecas_quebra_exame_key" UNIQUE("quebra_id","exame_id")
);
--> statement-breakpoint
ALTER TABLE "quebras_estudo_pecas" ADD CONSTRAINT "quebras_estudo_pecas_quebra_id_quebras_estudo_id_fk" FOREIGN KEY ("quebra_id") REFERENCES "public"."quebras_estudo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quebras_estudo_pecas" ADD CONSTRAINT "quebras_estudo_pecas_exame_id_exames_id_fk" FOREIGN KEY ("exame_id") REFERENCES "public"."exames"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quebras_estudo_pecas" ADD CONSTRAINT "quebras_estudo_pecas_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quebras_estudo_pecas_exame_idx" ON "quebras_estudo_pecas" USING btree ("exame_id");