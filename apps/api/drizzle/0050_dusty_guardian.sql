CREATE TABLE "competencias" (
	"competencia" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"fechada_em" timestamp with time zone,
	"fechada_por_id" uuid,
	"fechada_por_legado" text,
	"reaberta_em" timestamp with time zone,
	"reaberta_por_id" uuid,
	"reaberta_por_legado" text,
	"importacao_travada_em" timestamp with time zone,
	"importacao_travada_por_id" uuid,
	"importacao_travada_por_legado" text,
	"observacoes" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competencias_status_check" CHECK ("competencias"."status" in ('aberta', 'fechada'))
);
--> statement-breakpoint
CREATE TABLE "cortes_competencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid,
	"desde" text NOT NULL,
	"usa_padrao" boolean DEFAULT false NOT NULL,
	"dia" integer,
	"ultimo_dia" boolean DEFAULT false NOT NULL,
	"mes" text,
	"considera_exame" boolean,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "cortes_competencia_dia_check" CHECK ("cortes_competencia"."dia" between 1 and 31),
	CONSTRAINT "cortes_competencia_mes_check" CHECK ("cortes_competencia"."mes" in ('proprio', 'seguinte')),
	CONSTRAINT "cortes_competencia_usa_padrao_check" CHECK (not "cortes_competencia"."usa_padrao" or "cortes_competencia"."cliente_id" is not null),
	CONSTRAINT "cortes_competencia_corte_check" CHECK (case when "cortes_competencia"."usa_padrao"
        then "cortes_competencia"."dia" is null and not "cortes_competencia"."ultimo_dia" and "cortes_competencia"."mes" is null and "cortes_competencia"."considera_exame" is null
        else "cortes_competencia"."mes" is not null and "cortes_competencia"."considera_exame" is not null and ("cortes_competencia"."dia" is not null) <> "cortes_competencia"."ultimo_dia"
      end)
);
--> statement-breakpoint
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_fechada_por_id_usuarios_id_fk" FOREIGN KEY ("fechada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_reaberta_por_id_usuarios_id_fk" FOREIGN KEY ("reaberta_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_importacao_travada_por_id_usuarios_id_fk" FOREIGN KEY ("importacao_travada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes_competencia" ADD CONSTRAINT "cortes_competencia_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes_competencia" ADD CONSTRAINT "cortes_competencia_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competencias_status_idx" ON "competencias" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cortes_competencia_padrao_desde_key" ON "cortes_competencia" USING btree ("desde") WHERE "cortes_competencia"."cliente_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cortes_competencia_cliente_desde_key" ON "cortes_competencia" USING btree ("cliente_id","desde") WHERE "cortes_competencia"."cliente_id" is not null;