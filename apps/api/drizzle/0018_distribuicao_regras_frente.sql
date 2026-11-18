CREATE TYPE "public"."metodo_divisao" AS ENUM('igualitaria', 'proporcao');--> statement-breakpoint
CREATE TABLE "regras_frente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"especialidade_id" uuid,
	"modalidade_id" uuid,
	"lista_prioridades_propria" boolean DEFAULT false NOT NULL,
	"lista_prazo_proprio" boolean DEFAULT false NOT NULL,
	"lista_prazo_minimo_horas" integer,
	"recolhe_ao_fim_do_turno" boolean DEFAULT true NOT NULL,
	"distribui_pelo_robo" boolean DEFAULT true NOT NULL,
	"divisao" "metodo_divisao" DEFAULT 'igualitaria' NOT NULL,
	"teto_por_medico" integer,
	"lista_depois_dos_fixos" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_frente_frente_check" CHECK (("regras_frente"."especialidade_id" is null) <> ("regras_frente"."modalidade_id" is null)),
	CONSTRAINT "regras_frente_prazo_check" CHECK ("regras_frente"."lista_prazo_proprio" or "regras_frente"."lista_prazo_minimo_horas" is null)
);
--> statement-breakpoint
CREATE TABLE "regras_frente_horarios_sem_robo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regra_frente_id" uuid NOT NULL,
	"dias_semana" integer[] NOT NULL,
	"inicio" text NOT NULL,
	"fim" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_frente_lista_prioridades" (
	"regra_frente_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	CONSTRAINT "regras_frente_lista_prioridades_regra_frente_id_prioridade_id_pk" PRIMARY KEY("regra_frente_id","prioridade_id")
);
--> statement-breakpoint
CREATE TABLE "regras_frente_mistura" (
	"regra_frente_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"especialidade_id" uuid,
	"subespecialidade_id" uuid,
	CONSTRAINT "regras_frente_mistura_regra_frente_id_ordem_pk" PRIMARY KEY("regra_frente_id","ordem"),
	CONSTRAINT "regras_frente_mistura_fatia_check" CHECK ("regras_frente_mistura"."especialidade_id" is not null or "regras_frente_mistura"."subespecialidade_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "regras_frente_proporcoes" (
	"regra_frente_id" uuid NOT NULL,
	"modalidade_id" uuid NOT NULL,
	"percentual" integer NOT NULL,
	CONSTRAINT "regras_frente_proporcoes_regra_frente_id_modalidade_id_pk" PRIMARY KEY("regra_frente_id","modalidade_id"),
	CONSTRAINT "regras_frente_proporcoes_percentual_check" CHECK ("regras_frente_proporcoes"."percentual" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "regras_frente_segmentos" (
	"regra_frente_id" uuid NOT NULL,
	"subespecialidade_id" uuid NOT NULL,
	"teto" integer,
	"teto_reduzido" integer,
	"teto_reduzido_produtividade_ate" integer,
	"piso" integer,
	"pacote_a_parte" boolean DEFAULT false NOT NULL,
	CONSTRAINT "regras_frente_segmentos_regra_frente_id_subespecialidade_id_pk" PRIMARY KEY("regra_frente_id","subespecialidade_id"),
	CONSTRAINT "regras_frente_segmentos_reduzido_check" CHECK (("regras_frente_segmentos"."teto_reduzido" is null) = ("regras_frente_segmentos"."teto_reduzido_produtividade_ate" is null))
);
--> statement-breakpoint
ALTER TABLE "regras_frente" ADD CONSTRAINT "regras_frente_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente" ADD CONSTRAINT "regras_frente_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_horarios_sem_robo" ADD CONSTRAINT "regras_frente_horarios_sem_robo_regra_frente_id_regras_frente_id_fk" FOREIGN KEY ("regra_frente_id") REFERENCES "public"."regras_frente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_lista_prioridades" ADD CONSTRAINT "regras_frente_lista_prioridades_regra_frente_id_regras_frente_id_fk" FOREIGN KEY ("regra_frente_id") REFERENCES "public"."regras_frente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_lista_prioridades" ADD CONSTRAINT "regras_frente_lista_prioridades_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_mistura" ADD CONSTRAINT "regras_frente_mistura_regra_frente_id_regras_frente_id_fk" FOREIGN KEY ("regra_frente_id") REFERENCES "public"."regras_frente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_mistura" ADD CONSTRAINT "regras_frente_mistura_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_mistura" ADD CONSTRAINT "regras_frente_mistura_subespecialidade_id_subespecialidades_id_fk" FOREIGN KEY ("subespecialidade_id") REFERENCES "public"."subespecialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_proporcoes" ADD CONSTRAINT "regras_frente_proporcoes_regra_frente_id_regras_frente_id_fk" FOREIGN KEY ("regra_frente_id") REFERENCES "public"."regras_frente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_proporcoes" ADD CONSTRAINT "regras_frente_proporcoes_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_segmentos" ADD CONSTRAINT "regras_frente_segmentos_regra_frente_id_regras_frente_id_fk" FOREIGN KEY ("regra_frente_id") REFERENCES "public"."regras_frente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_segmentos" ADD CONSTRAINT "regras_frente_segmentos_subespecialidade_id_subespecialidades_id_fk" FOREIGN KEY ("subespecialidade_id") REFERENCES "public"."subespecialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regras_frente_especialidade_key" ON "regras_frente" USING btree ("especialidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regras_frente_modalidade_key" ON "regras_frente" USING btree ("modalidade_id");--> statement-breakpoint
CREATE INDEX "regras_frente_horarios_sem_robo_regra_idx" ON "regras_frente_horarios_sem_robo" USING btree ("regra_frente_id");