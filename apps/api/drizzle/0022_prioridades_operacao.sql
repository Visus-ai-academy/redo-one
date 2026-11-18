CREATE TYPE "public"."tipo_recebimento" AS ENUM('segue_sla', 'prazo_minimo', 'nao_recebe');--> statement-breakpoint
CREATE TYPE "public"."tipo_urgencia" AS ENUM('nunca', 'sempre', 'prazo');--> statement-breakpoint
CREATE TABLE "prioridades_operacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"posicao" integer NOT NULL,
	"urgencia" "tipo_urgencia" NOT NULL,
	"urgencia_horas" integer,
	"padrao" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prioridades_operacao_posicao_check" CHECK ("prioridades_operacao"."posicao" >= 1),
	CONSTRAINT "prioridades_operacao_urgencia_check" CHECK (("prioridades_operacao"."urgencia" = 'prazo') = ("prioridades_operacao"."urgencia_horas" is not null))
);
--> statement-breakpoint
CREATE TABLE "prioridades_operacao_grafias" (
	"grafia_normalizada" text PRIMARY KEY NOT NULL,
	"grafia" text NOT NULL,
	"prioridade_operacao_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recebimento_geral" (
	"prioridade_operacao_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"regra" "tipo_recebimento" NOT NULL,
	"prazo_minimo_horas" integer,
	CONSTRAINT "recebimento_geral_prioridade_operacao_id_turno_id_pk" PRIMARY KEY("prioridade_operacao_id","turno_id"),
	CONSTRAINT "recebimento_geral_prazo_check" CHECK (("recebimento_geral"."regra" = 'prazo_minimo') = ("recebimento_geral"."prazo_minimo_horas" is not null))
);
--> statement-breakpoint
CREATE TABLE "regras_frente_recebimento" (
	"regra_frente_id" uuid NOT NULL,
	"prioridade_operacao_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"regra" "tipo_recebimento" NOT NULL,
	"prazo_minimo_horas" integer,
	CONSTRAINT "regras_frente_recebimento_regra_frente_id_prioridade_operacao_id_turno_id_pk" PRIMARY KEY("regra_frente_id","prioridade_operacao_id","turno_id"),
	CONSTRAINT "regras_frente_recebimento_prazo_check" CHECK (("regras_frente_recebimento"."regra" = 'prazo_minimo') = ("regras_frente_recebimento"."prazo_minimo_horas" is not null))
);
--> statement-breakpoint
CREATE TABLE "regras_frente_urgencias" (
	"regra_frente_id" uuid NOT NULL,
	"prioridade_operacao_id" uuid NOT NULL,
	"urgencia" "tipo_urgencia" NOT NULL,
	"urgencia_horas" integer,
	CONSTRAINT "regras_frente_urgencias_regra_frente_id_prioridade_operacao_id_pk" PRIMARY KEY("regra_frente_id","prioridade_operacao_id"),
	CONSTRAINT "regras_frente_urgencias_horas_check" CHECK (("regras_frente_urgencias"."urgencia" = 'prazo') = ("regras_frente_urgencias"."urgencia_horas" is not null))
);
--> statement-breakpoint
ALTER TABLE "prioridades_operacao_grafias" ADD CONSTRAINT "prioridades_operacao_grafias_prioridade_operacao_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_operacao_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimento_geral" ADD CONSTRAINT "recebimento_geral_prioridade_operacao_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_operacao_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimento_geral" ADD CONSTRAINT "recebimento_geral_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_recebimento" ADD CONSTRAINT "regras_frente_recebimento_regra_frente_id_regras_frente_id_fk" FOREIGN KEY ("regra_frente_id") REFERENCES "public"."regras_frente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_recebimento" ADD CONSTRAINT "regras_frente_recebimento_prioridade_operacao_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_operacao_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_recebimento" ADD CONSTRAINT "regras_frente_recebimento_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_urgencias" ADD CONSTRAINT "regras_frente_urgencias_regra_frente_id_regras_frente_id_fk" FOREIGN KEY ("regra_frente_id") REFERENCES "public"."regras_frente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_frente_urgencias" ADD CONSTRAINT "regras_frente_urgencias_prioridade_operacao_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_operacao_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prioridades_operacao_nome_key" ON "prioridades_operacao" USING btree (upper("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "prioridades_operacao_padrao_key" ON "prioridades_operacao" USING btree ("padrao") WHERE "prioridades_operacao"."padrao";--> statement-breakpoint
CREATE INDEX "prioridades_operacao_grafias_prioridade_idx" ON "prioridades_operacao_grafias" USING btree ("prioridade_operacao_id");