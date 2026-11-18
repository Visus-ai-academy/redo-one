CREATE TABLE "configuracao_distribuicao" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ordem_fila" jsonb NOT NULL,
	"agrupar_por_paciente" boolean NOT NULL,
	"janela_paciente_horas" integer NOT NULL,
	"tolerancia_acima_teto" integer NOT NULL,
	"margem_urgencia_pct" integer NOT NULL,
	"folga_proporcao_pct" integer NOT NULL,
	"prazo_critico_min" integer NOT NULL,
	"antecedencia_periodo_min" integer NOT NULL,
	"ciclo_minutos" integer NOT NULL,
	"marcadores_equilibrio" text[] NOT NULL,
	"escala_restringe_especialidade" boolean NOT NULL,
	"dias_ja_entregue" integer NOT NULL,
	"turnos_posteriores_cheia_em" text,
	"lista_prazo_minimo_horas" integer,
	"recolhimento_apos_turno_min" integer,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracao_distribuicao_unica" CHECK ("configuracao_distribuicao"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "configuracao_distribuicao_lista_prioridades" (
	"prioridade_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracao_distribuicao_turnos_posteriores" (
	"turno_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracao_distribuicao_urgentes" (
	"prioridade_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao_lista_prioridades" ADD CONSTRAINT "configuracao_distribuicao_lista_prioridades_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao_turnos_posteriores" ADD CONSTRAINT "configuracao_distribuicao_turnos_posteriores_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao_urgentes" ADD CONSTRAINT "configuracao_distribuicao_urgentes_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE cascade ON UPDATE no action;