CREATE TABLE "reclassificacoes_faturamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"todas_modalidades" boolean NOT NULL,
	"todas_especialidades" boolean NOT NULL,
	"todas_categorias" boolean NOT NULL,
	"todos_medicos" boolean NOT NULL,
	"especialidade_destino_id" uuid,
	"categoria_destino_id" uuid,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "reclassificacoes_faturamento_destino_check" CHECK ("reclassificacoes_faturamento"."especialidade_destino_id" is not null or "reclassificacoes_faturamento"."categoria_destino_id" is not null),
	CONSTRAINT "reclassificacoes_faturamento_vigencia_check" CHECK (("reclassificacoes_faturamento"."vigencia_desde" is null or "reclassificacoes_faturamento"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
        and ("reclassificacoes_faturamento"."vigencia_ate" is null or "reclassificacoes_faturamento"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
        and ("reclassificacoes_faturamento"."vigencia_desde" is null or "reclassificacoes_faturamento"."vigencia_ate" is null or "reclassificacoes_faturamento"."vigencia_ate" >= "reclassificacoes_faturamento"."vigencia_desde"))
);
--> statement-breakpoint
CREATE TABLE "reclassificacoes_faturamento_recortes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reclassificacao_id" uuid NOT NULL,
	"modalidade_id" uuid,
	"especialidade_id" uuid,
	"categoria_id" uuid,
	"equipe_id" uuid,
	CONSTRAINT "reclassificacoes_faturamento_recortes_uma_check" CHECK (num_nonnulls("reclassificacoes_faturamento_recortes"."modalidade_id", "reclassificacoes_faturamento_recortes"."especialidade_id", "reclassificacoes_faturamento_recortes"."categoria_id", "reclassificacoes_faturamento_recortes"."equipe_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento" ADD CONSTRAINT "reclassificacoes_faturamento_especialidade_destino_id_especialidades_id_fk" FOREIGN KEY ("especialidade_destino_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento" ADD CONSTRAINT "reclassificacoes_faturamento_categoria_destino_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_destino_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento" ADD CONSTRAINT "reclassificacoes_faturamento_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento_recortes" ADD CONSTRAINT "reclassificacoes_faturamento_recortes_reclassificacao_id_reclassificacoes_faturamento_id_fk" FOREIGN KEY ("reclassificacao_id") REFERENCES "public"."reclassificacoes_faturamento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento_recortes" ADD CONSTRAINT "reclassificacoes_faturamento_recortes_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento_recortes" ADD CONSTRAINT "reclassificacoes_faturamento_recortes_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento_recortes" ADD CONSTRAINT "reclassificacoes_faturamento_recortes_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_faturamento_recortes" ADD CONSTRAINT "reclassificacoes_faturamento_recortes_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reclassificacoes_faturamento_recortes_regra_idx" ON "reclassificacoes_faturamento_recortes" USING btree ("reclassificacao_id");