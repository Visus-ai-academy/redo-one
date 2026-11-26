CREATE TABLE "parametros_demonstrativo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"desde" text,
	"cobra_duplicados" boolean NOT NULL,
	"cobra_clientes_inativos" boolean NOT NULL,
	"categoria_padrao_id" uuid,
	"prioridade_padrao_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "parametros_demonstrativo_desde_check" CHECK ("parametros_demonstrativo"."desde" is null or "parametros_demonstrativo"."desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "prioridades_alternativas_preco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prioridade_id" uuid NOT NULL,
	"alternativa_id" uuid,
	"desde" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "prioridades_alternativas_preco_desde_check" CHECK ("prioridades_alternativas_preco"."desde" is null or "prioridades_alternativas_preco"."desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "prioridades_alternativas_preco_outra_check" CHECK ("prioridades_alternativas_preco"."alternativa_id" is null or "prioridades_alternativas_preco"."alternativa_id" <> "prioridades_alternativas_preco"."prioridade_id")
);
--> statement-breakpoint
ALTER TABLE "parametros_demonstrativo" ADD CONSTRAINT "parametros_demonstrativo_categoria_padrao_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_padrao_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_demonstrativo" ADD CONSTRAINT "parametros_demonstrativo_prioridade_padrao_id_prioridades_id_fk" FOREIGN KEY ("prioridade_padrao_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_demonstrativo" ADD CONSTRAINT "parametros_demonstrativo_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prioridades_alternativas_preco" ADD CONSTRAINT "prioridades_alternativas_preco_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prioridades_alternativas_preco" ADD CONSTRAINT "prioridades_alternativas_preco_alternativa_id_prioridades_id_fk" FOREIGN KEY ("alternativa_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prioridades_alternativas_preco" ADD CONSTRAINT "prioridades_alternativas_preco_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prioridades_alternativas_preco_prioridade_idx" ON "prioridades_alternativas_preco" USING btree ("prioridade_id");