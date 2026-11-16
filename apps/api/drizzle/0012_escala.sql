CREATE TYPE "public"."origem_ausencia" AS ENUM('gestor', 'medico');--> statement-breakpoint
CREATE TYPE "public"."situacao_ausencia" AS ENUM('pendente', 'aprovada', 'recusada');--> statement-breakpoint
CREATE TYPE "public"."tipo_frente_escala" AS ENUM('especialidade', 'modalidade');--> statement-breakpoint
CREATE TYPE "public"."tipo_turno" AS ENUM('fixo', 'lista');--> statement-breakpoint
CREATE TABLE "ajustes_produtividade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alocacao_id" uuid NOT NULL,
	"data" date NOT NULL,
	"produtividade" integer NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ajustes_produtividade_alocacao_data_key" UNIQUE("alocacao_id","data"),
	CONSTRAINT "ajustes_produtividade_valor_check" CHECK ("ajustes_produtividade"."produtividade" >= 0)
);
--> statement-breakpoint
CREATE TABLE "alocacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"frente_id" uuid NOT NULL,
	"dias_semana" integer[] NOT NULL,
	"semanas_do_mes" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"horario_inicio" text NOT NULL,
	"horario_fim" text NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date,
	"produtividade" integer,
	"gratificado" boolean DEFAULT false NOT NULL,
	"subespecialidade_geral" boolean DEFAULT false NOT NULL,
	"cobertura_de_id" uuid,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alocacoes_periodo_check" CHECK ("alocacoes"."data_fim" is null or "alocacoes"."data_fim" >= "alocacoes"."data_inicio"),
	CONSTRAINT "alocacoes_horario_inicio_check" CHECK ("alocacoes"."horario_inicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "alocacoes_horario_fim_check" CHECK ("alocacoes"."horario_fim" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "alocacoes_produtividade_check" CHECK ("alocacoes"."produtividade" is null or "alocacoes"."produtividade" >= 0),
	CONSTRAINT "alocacoes_cobertura_check" CHECK ("alocacoes"."cobertura_de_id" <> "alocacoes"."id")
);
--> statement-breakpoint
CREATE TABLE "alocacoes_prioridades" (
	"alocacao_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	CONSTRAINT "alocacoes_prioridades_alocacao_id_prioridade_id_pk" PRIMARY KEY("alocacao_id","prioridade_id")
);
--> statement-breakpoint
CREATE TABLE "alocacoes_subespecialidades" (
	"alocacao_id" uuid NOT NULL,
	"subespecialidade_id" uuid NOT NULL,
	CONSTRAINT "alocacoes_subespecialidades_alocacao_id_subespecialidade_id_pk" PRIMARY KEY("alocacao_id","subespecialidade_id")
);
--> statement-breakpoint
CREATE TABLE "ausencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"dias_semana" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"situacao" "situacao_ausencia" DEFAULT 'aprovada' NOT NULL,
	"origem" "origem_ausencia" DEFAULT 'gestor' NOT NULL,
	"observacoes" text,
	"motivo_recusa" text,
	"solicitada_por_id" uuid,
	"revisada_por_id" uuid,
	"revisada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ausencias_periodo_check" CHECK ("ausencias"."data_fim" >= "ausencias"."data_inicio")
);
--> statement-breakpoint
CREATE TABLE "ausencias_frentes" (
	"ausencia_id" uuid NOT NULL,
	"frente_id" uuid NOT NULL,
	CONSTRAINT "ausencias_frentes_ausencia_id_frente_id_pk" PRIMARY KEY("ausencia_id","frente_id")
);
--> statement-breakpoint
CREATE TABLE "ausencias_turnos" (
	"ausencia_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	CONSTRAINT "ausencias_turnos_ausencia_id_turno_id_pk" PRIMARY KEY("ausencia_id","turno_id")
);
--> statement-breakpoint
CREATE TABLE "frentes_escala" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_frente_escala" NOT NULL,
	"especialidade_id" uuid,
	"modalidade_id" uuid,
	"rotulo" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frentes_escala_especialidade_id_unique" UNIQUE("especialidade_id"),
	CONSTRAINT "frentes_escala_modalidade_id_unique" UNIQUE("modalidade_id"),
	CONSTRAINT "frentes_escala_rotulo_unique" UNIQUE("rotulo"),
	CONSTRAINT "frentes_escala_destino_check" CHECK (("frentes_escala"."tipo" = 'especialidade' and "frentes_escala"."especialidade_id" is not null and "frentes_escala"."modalidade_id" is null)
        or ("frentes_escala"."tipo" = 'modalidade' and "frentes_escala"."modalidade_id" is not null and "frentes_escala"."especialidade_id" is null))
);
--> statement-breakpoint
CREATE TABLE "tipos_ausencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"gravidade" integer DEFAULT 0 NOT NULL,
	"so_gestor" boolean DEFAULT false NOT NULL,
	"conta_como_falta" boolean DEFAULT false NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipos_ausencia_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_turno" DEFAULT 'fixo' NOT NULL,
	"horario_inicio" text NOT NULL,
	"horario_fim" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnos_nome_unique" UNIQUE("nome"),
	CONSTRAINT "turnos_horario_inicio_check" CHECK ("turnos"."horario_inicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "turnos_horario_fim_check" CHECK ("turnos"."horario_fim" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "turnos_frentes" (
	"turno_id" uuid NOT NULL,
	"frente_id" uuid NOT NULL,
	CONSTRAINT "turnos_frentes_turno_id_frente_id_pk" PRIMARY KEY("turno_id","frente_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios_escopos_escala" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"turno_id" uuid,
	"frente_id" uuid,
	CONSTRAINT "usuarios_escopos_escala_turno_key" UNIQUE("usuario_id","turno_id"),
	CONSTRAINT "usuarios_escopos_escala_frente_key" UNIQUE("usuario_id","frente_id"),
	CONSTRAINT "usuarios_escopos_escala_alvo_check" CHECK (("usuarios_escopos_escala"."turno_id" is null) <> ("usuarios_escopos_escala"."frente_id" is null))
);
--> statement-breakpoint
ALTER TABLE "ajustes_produtividade" ADD CONSTRAINT "ajustes_produtividade_alocacao_id_alocacoes_id_fk" FOREIGN KEY ("alocacao_id") REFERENCES "public"."alocacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes" ADD CONSTRAINT "alocacoes_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes" ADD CONSTRAINT "alocacoes_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes" ADD CONSTRAINT "alocacoes_frente_id_frentes_escala_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes_escala"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes" ADD CONSTRAINT "alocacoes_cobertura_de_id_alocacoes_id_fk" FOREIGN KEY ("cobertura_de_id") REFERENCES "public"."alocacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes_prioridades" ADD CONSTRAINT "alocacoes_prioridades_alocacao_id_alocacoes_id_fk" FOREIGN KEY ("alocacao_id") REFERENCES "public"."alocacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes_prioridades" ADD CONSTRAINT "alocacoes_prioridades_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes_subespecialidades" ADD CONSTRAINT "alocacoes_subespecialidades_alocacao_id_alocacoes_id_fk" FOREIGN KEY ("alocacao_id") REFERENCES "public"."alocacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes_subespecialidades" ADD CONSTRAINT "alocacoes_subespecialidades_subespecialidade_id_subespecialidades_id_fk" FOREIGN KEY ("subespecialidade_id") REFERENCES "public"."subespecialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_tipo_id_tipos_ausencia_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_ausencia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_solicitada_por_id_usuarios_id_fk" FOREIGN KEY ("solicitada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_revisada_por_id_usuarios_id_fk" FOREIGN KEY ("revisada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias_frentes" ADD CONSTRAINT "ausencias_frentes_ausencia_id_ausencias_id_fk" FOREIGN KEY ("ausencia_id") REFERENCES "public"."ausencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias_frentes" ADD CONSTRAINT "ausencias_frentes_frente_id_frentes_escala_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes_escala"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias_turnos" ADD CONSTRAINT "ausencias_turnos_ausencia_id_ausencias_id_fk" FOREIGN KEY ("ausencia_id") REFERENCES "public"."ausencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias_turnos" ADD CONSTRAINT "ausencias_turnos_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frentes_escala" ADD CONSTRAINT "frentes_escala_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frentes_escala" ADD CONSTRAINT "frentes_escala_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_frentes" ADD CONSTRAINT "turnos_frentes_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_frentes" ADD CONSTRAINT "turnos_frentes_frente_id_frentes_escala_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes_escala"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_escopos_escala" ADD CONSTRAINT "usuarios_escopos_escala_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_escopos_escala" ADD CONSTRAINT "usuarios_escopos_escala_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_escopos_escala" ADD CONSTRAINT "usuarios_escopos_escala_frente_id_frentes_escala_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes_escala"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajustes_produtividade_data_idx" ON "ajustes_produtividade" USING btree ("data");--> statement-breakpoint
CREATE INDEX "alocacoes_vigencia_idx" ON "alocacoes" USING btree ("data_inicio","data_fim");--> statement-breakpoint
CREATE INDEX "alocacoes_medico_idx" ON "alocacoes" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "alocacoes_turno_frente_idx" ON "alocacoes" USING btree ("turno_id","frente_id");--> statement-breakpoint
CREATE INDEX "alocacoes_cobertura_de_idx" ON "alocacoes" USING btree ("cobertura_de_id");--> statement-breakpoint
CREATE INDEX "ausencias_medico_idx" ON "ausencias" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "ausencias_periodo_idx" ON "ausencias" USING btree ("data_inicio","data_fim");--> statement-breakpoint
CREATE INDEX "ausencias_situacao_idx" ON "ausencias" USING btree ("situacao");--> statement-breakpoint
CREATE INDEX "frentes_escala_ativo_ordem_idx" ON "frentes_escala" USING btree ("ativo","ordem");--> statement-breakpoint
CREATE INDEX "turnos_ativo_ordem_idx" ON "turnos" USING btree ("ativo","ordem");--> statement-breakpoint
CREATE INDEX "turnos_frentes_frente_idx" ON "turnos_frentes" USING btree ("frente_id");--> statement-breakpoint
CREATE INDEX "usuarios_escopos_escala_usuario_idx" ON "usuarios_escopos_escala" USING btree ("usuario_id");