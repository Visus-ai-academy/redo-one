CREATE TABLE "reguas_repasse_nivel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nivel_id" uuid NOT NULL,
	"modalidade_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	"todas_categorias" boolean NOT NULL,
	"categoria_id" uuid,
	"todas_prioridades" boolean NOT NULL,
	"prioridade_id" uuid,
	"valor_centavos" integer NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "reguas_repasse_nivel_recorte_check" CHECK ("reguas_repasse_nivel"."todas_categorias" = ("reguas_repasse_nivel"."categoria_id" is null) and "reguas_repasse_nivel"."todas_prioridades" = ("reguas_repasse_nivel"."prioridade_id" is null)),
	CONSTRAINT "reguas_repasse_nivel_valor_check" CHECK ("reguas_repasse_nivel"."valor_centavos" > 0),
	CONSTRAINT "reguas_repasse_nivel_vigencia_check" CHECK (("reguas_repasse_nivel"."vigencia_desde" is null or "reguas_repasse_nivel"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("reguas_repasse_nivel"."vigencia_ate" is null or "reguas_repasse_nivel"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("reguas_repasse_nivel"."vigencia_desde" is null or "reguas_repasse_nivel"."vigencia_ate" is null or "reguas_repasse_nivel"."vigencia_ate" >= "reguas_repasse_nivel"."vigencia_desde"))
);
--> statement-breakpoint
ALTER TABLE "reguas_repasse_nivel" ADD CONSTRAINT "reguas_repasse_nivel_nivel_id_niveis_medico_id_fk" FOREIGN KEY ("nivel_id") REFERENCES "public"."niveis_medico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reguas_repasse_nivel" ADD CONSTRAINT "reguas_repasse_nivel_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reguas_repasse_nivel" ADD CONSTRAINT "reguas_repasse_nivel_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reguas_repasse_nivel" ADD CONSTRAINT "reguas_repasse_nivel_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reguas_repasse_nivel" ADD CONSTRAINT "reguas_repasse_nivel_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reguas_repasse_nivel" ADD CONSTRAINT "reguas_repasse_nivel_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reguas_repasse_nivel_nivel_idx" ON "reguas_repasse_nivel" USING btree ("nivel_id","modalidade_id","especialidade_id");