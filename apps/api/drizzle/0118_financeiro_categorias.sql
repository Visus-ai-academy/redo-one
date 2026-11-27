CREATE TYPE "public"."tipo_categoria_financeira" AS ENUM('receita', 'despesa');--> statement-breakpoint
CREATE TABLE "categorias_financeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_categoria_financeira" NOT NULL,
	"nome" text NOT NULL,
	"pai_id" uuid,
	"codigo_contabil" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_financeiras_pai_check" CHECK ("categorias_financeiras"."pai_id" <> "categorias_financeiras"."id")
);
--> statement-breakpoint
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_pai_id_categorias_financeiras_id_fk" FOREIGN KEY ("pai_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_financeiras_nome_key" ON "categorias_financeiras" USING btree ("tipo",coalesce("pai_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("nome"));--> statement-breakpoint
CREATE INDEX "categorias_financeiras_pai_idx" ON "categorias_financeiras" USING btree ("pai_id");--> statement-breakpoint
CREATE INDEX "categorias_financeiras_tipo_ativa_idx" ON "categorias_financeiras" USING btree ("tipo","ativa");