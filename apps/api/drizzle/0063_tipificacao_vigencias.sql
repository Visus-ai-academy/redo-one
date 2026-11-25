CREATE TABLE "clientes_tipificacao_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"vigencia_desde" text NOT NULL,
	"vigencia_ate" text,
	"regra_id" uuid,
	"subregra_demais_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "clientes_tipificacao_versoes_vigencia_check" CHECK ("clientes_tipificacao_versoes"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and ("clientes_tipificacao_versoes"."vigencia_ate" is null or ("clientes_tipificacao_versoes"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "clientes_tipificacao_versoes"."vigencia_ate" >= "clientes_tipificacao_versoes"."vigencia_desde")))
);
--> statement-breakpoint
CREATE TABLE "regras_tipificacao_fatura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regra_id" uuid NOT NULL,
	"vigencia_desde" text NOT NULL,
	"vigencia_ate" text,
	"fatura_sem_subregra" boolean NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "regras_tipificacao_fatura_vigencia_check" CHECK ("regras_tipificacao_fatura"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and ("regras_tipificacao_fatura"."vigencia_ate" is null or ("regras_tipificacao_fatura"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "regras_tipificacao_fatura"."vigencia_ate" >= "regras_tipificacao_fatura"."vigencia_desde")))
);
--> statement-breakpoint
CREATE TABLE "subregras_tipificacao_fatura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subregra_id" uuid NOT NULL,
	"vigencia_desde" text NOT NULL,
	"vigencia_ate" text,
	"fatura" boolean NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "subregras_tipificacao_fatura_vigencia_check" CHECK ("subregras_tipificacao_fatura"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and ("subregras_tipificacao_fatura"."vigencia_ate" is null or ("subregras_tipificacao_fatura"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "subregras_tipificacao_fatura"."vigencia_ate" >= "subregras_tipificacao_fatura"."vigencia_desde")))
);
--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" ADD COLUMN "versao_id" uuid;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_versoes" ADD CONSTRAINT "clientes_tipificacao_versoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_versoes" ADD CONSTRAINT "clientes_tipificacao_versoes_regra_id_regras_tipificacao_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_versoes" ADD CONSTRAINT "clientes_tipificacao_versoes_subregra_demais_id_subregras_tipificacao_id_fk" FOREIGN KEY ("subregra_demais_id") REFERENCES "public"."subregras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_versoes" ADD CONSTRAINT "clientes_tipificacao_versoes_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_tipificacao_fatura" ADD CONSTRAINT "regras_tipificacao_fatura_regra_id_regras_tipificacao_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_tipificacao_fatura" ADD CONSTRAINT "regras_tipificacao_fatura_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subregras_tipificacao_fatura" ADD CONSTRAINT "subregras_tipificacao_fatura_subregra_id_subregras_tipificacao_id_fk" FOREIGN KEY ("subregra_id") REFERENCES "public"."subregras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subregras_tipificacao_fatura" ADD CONSTRAINT "subregras_tipificacao_fatura_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_tipificacao_versoes_desde_key" ON "clientes_tipificacao_versoes" USING btree ("cliente_id","vigencia_desde");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_versoes_regra_idx" ON "clientes_tipificacao_versoes" USING btree ("regra_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_versoes_subregra_demais_idx" ON "clientes_tipificacao_versoes" USING btree ("subregra_demais_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regras_tipificacao_fatura_desde_key" ON "regras_tipificacao_fatura" USING btree ("regra_id","vigencia_desde");--> statement-breakpoint
CREATE UNIQUE INDEX "subregras_tipificacao_fatura_desde_key" ON "subregras_tipificacao_fatura" USING btree ("subregra_id","vigencia_desde");--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" ADD CONSTRAINT "clientes_tipificacao_linhas_versao_id_clientes_tipificacao_versoes_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."clientes_tipificacao_versoes"("id") ON DELETE cascade ON UPDATE no action;