CREATE TYPE "public"."cond_volume" AS ENUM('MOD', 'MOD_ESP', 'MOD_ESP_CAT', 'TOTAL');--> statement-breakpoint
CREATE TABLE "precos_cliente" (
	"cliente_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modalidade_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	"faixa_inicio" integer,
	"faixa_fim" integer,
	"cond_volume" "cond_volume" DEFAULT 'MOD_ESP_CAT' NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "precos_cliente_valor_check" CHECK ("precos_cliente"."valor" > 0),
	CONSTRAINT "precos_cliente_faixa_check" CHECK (("precos_cliente"."faixa_inicio" is null or "precos_cliente"."faixa_inicio" >= 0) and ("precos_cliente"."faixa_fim" is null or "precos_cliente"."faixa_fim" >= coalesce("precos_cliente"."faixa_inicio", 0))),
	CONSTRAINT "precos_cliente_vigencia_check" CHECK (("precos_cliente"."vigencia_desde" is null or "precos_cliente"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("precos_cliente"."vigencia_ate" is null or "precos_cliente"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("precos_cliente"."vigencia_desde" is null or "precos_cliente"."vigencia_ate" is null or "precos_cliente"."vigencia_ate" >= "precos_cliente"."vigencia_desde"))
);
--> statement-breakpoint
CREATE TABLE "precos_padrao_contratado" (
	"contratado_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modalidade_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	"faixa_inicio" integer,
	"faixa_fim" integer,
	"cond_volume" "cond_volume" DEFAULT 'MOD_ESP_CAT' NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "precos_padrao_contratado_valor_check" CHECK ("precos_padrao_contratado"."valor" > 0),
	CONSTRAINT "precos_padrao_contratado_faixa_check" CHECK (("precos_padrao_contratado"."faixa_inicio" is null or "precos_padrao_contratado"."faixa_inicio" >= 0) and ("precos_padrao_contratado"."faixa_fim" is null or "precos_padrao_contratado"."faixa_fim" >= coalesce("precos_padrao_contratado"."faixa_inicio", 0))),
	CONSTRAINT "precos_padrao_contratado_vigencia_check" CHECK (("precos_padrao_contratado"."vigencia_desde" is null or "precos_padrao_contratado"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("precos_padrao_contratado"."vigencia_ate" is null or "precos_padrao_contratado"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("precos_padrao_contratado"."vigencia_desde" is null or "precos_padrao_contratado"."vigencia_ate" is null or "precos_padrao_contratado"."vigencia_ate" >= "precos_padrao_contratado"."vigencia_desde"))
);
--> statement-breakpoint
ALTER TABLE "precos_cliente" ADD CONSTRAINT "precos_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_cliente" ADD CONSTRAINT "precos_cliente_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_cliente" ADD CONSTRAINT "precos_cliente_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_cliente" ADD CONSTRAINT "precos_cliente_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_cliente" ADD CONSTRAINT "precos_cliente_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_cliente" ADD CONSTRAINT "precos_cliente_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_padrao_contratado" ADD CONSTRAINT "precos_padrao_contratado_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_padrao_contratado" ADD CONSTRAINT "precos_padrao_contratado_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_padrao_contratado" ADD CONSTRAINT "precos_padrao_contratado_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_padrao_contratado" ADD CONSTRAINT "precos_padrao_contratado_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_padrao_contratado" ADD CONSTRAINT "precos_padrao_contratado_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_padrao_contratado" ADD CONSTRAINT "precos_padrao_contratado_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "precos_cliente_arranjo_idx" ON "precos_cliente" USING btree ("cliente_id","modalidade_id","especialidade_id","categoria_id","prioridade_id");--> statement-breakpoint
CREATE INDEX "precos_padrao_contratado_arranjo_idx" ON "precos_padrao_contratado" USING btree ("contratado_id","modalidade_id","especialidade_id","categoria_id","prioridade_id");