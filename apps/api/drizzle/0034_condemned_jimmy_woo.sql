CREATE TABLE "retrato_fila_distribuicao" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fila" jsonb,
	"lida_em" timestamp with time zone,
	"pedida_em" timestamp with time zone,
	"falhou_em" timestamp with time zone,
	"erro" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retrato_fila_distribuicao_unico" CHECK ("retrato_fila_distribuicao"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao" ADD COLUMN "retrato_fila_min" integer DEFAULT 5;