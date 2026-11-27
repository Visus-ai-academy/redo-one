CREATE TYPE "public"."integracao_bancaria" AS ENUM('nenhuma', 'itau');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta_bancaria" AS ENUM('corrente', 'aplicacao', 'caixa');--> statement-breakpoint
CREATE TABLE "contas_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contratado_id" uuid NOT NULL,
	"apelido" text NOT NULL,
	"tipo" "tipo_conta_bancaria" NOT NULL,
	"banco_codigo" text,
	"agencia" text,
	"conta" text,
	"digito" text,
	"saldo_inicial_centavos" bigint NOT NULL,
	"saldo_inicial_em" date NOT NULL,
	"integracao" "integracao_bancaria" DEFAULT 'nenhuma' NOT NULL,
	"credencial" text,
	"padrao_recebimento" boolean DEFAULT false NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_bancarias_credencial_check" CHECK (("contas_bancarias"."integracao" = 'nenhuma') = ("contas_bancarias"."credencial" is null)),
	CONSTRAINT "contas_bancarias_padrao_ativa_check" CHECK (not "contas_bancarias"."padrao_recebimento" or "contas_bancarias"."ativa")
);
--> statement-breakpoint
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contas_bancarias_apelido_key" ON "contas_bancarias" USING btree ("contratado_id",lower("apelido"));--> statement-breakpoint
CREATE UNIQUE INDEX "contas_bancarias_padrao_key" ON "contas_bancarias" USING btree ("contratado_id") WHERE "contas_bancarias"."padrao_recebimento";--> statement-breakpoint
CREATE INDEX "contas_bancarias_ativa_idx" ON "contas_bancarias" USING btree ("ativa");