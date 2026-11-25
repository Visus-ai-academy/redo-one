CREATE TABLE "excecoes_recebimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turno_id" uuid NOT NULL,
	"especialidade_id" uuid,
	"modalidade_id" uuid,
	"prioridade_operacao_id" uuid,
	"regra" "tipo_recebimento" NOT NULL,
	"prazo_minimo_horas" integer,
	"de" date NOT NULL,
	"ate" date NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excecoes_recebimento_prazo_check" CHECK (("excecoes_recebimento"."regra" = 'prazo_minimo') = ("excecoes_recebimento"."prazo_minimo_horas" is not null)),
	CONSTRAINT "excecoes_recebimento_frente_check" CHECK ("excecoes_recebimento"."especialidade_id" is null or "excecoes_recebimento"."modalidade_id" is null),
	CONSTRAINT "excecoes_recebimento_periodo_check" CHECK ("excecoes_recebimento"."de" <= "excecoes_recebimento"."ate")
);
--> statement-breakpoint
ALTER TABLE "excecoes_recebimento" ADD CONSTRAINT "excecoes_recebimento_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_recebimento" ADD CONSTRAINT "excecoes_recebimento_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_recebimento" ADD CONSTRAINT "excecoes_recebimento_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_recebimento" ADD CONSTRAINT "excecoes_recebimento_prioridade_operacao_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_operacao_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "excecoes_recebimento_ate_idx" ON "excecoes_recebimento" USING btree ("ate");