CREATE TYPE "public"."status_designacao" AS ENUM('prevista', 'executada', 'pulada', 'falhou', 'recusada');--> statement-breakpoint
CREATE TYPE "public"."status_rodada" AS ENUM('solicitada', 'lendo', 'aguardando_aprovacao', 'aprovada', 'executando', 'pausada', 'parcial', 'concluida', 'expirada', 'cancelada', 'falhou');--> statement-breakpoint
CREATE TABLE "designacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rodada_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"id_exame_mobilemed" text NOT NULL,
	"paciente_chave" text NOT NULL,
	"estudo" text NOT NULL,
	"unidade" text NOT NULL,
	"exame_id" uuid,
	"cliente_id" uuid,
	"prioridade_grafia" text,
	"prioridade_operacao_id" uuid,
	"prioridade_id" uuid,
	"especialidade_id" uuid,
	"modalidade_id" uuid,
	"subespecialidade_id" uuid,
	"laudos" integer DEFAULT 1 NOT NULL,
	"realizado_em" timestamp with time zone NOT NULL,
	"entrada_em" timestamp with time zone NOT NULL,
	"prazo" timestamp with time zone,
	"posicao" integer,
	"urgente" boolean DEFAULT false NOT NULL,
	"medico_proposto_id" uuid,
	"medico_id" uuid,
	"agrupado_com" text,
	"gratificado" boolean DEFAULT false NOT NULL,
	"alocacao_gratificada_id" uuid,
	"cobertura_de_id" uuid,
	"status" "status_designacao" NOT NULL,
	"motivo" text,
	"detalhe" text,
	"retentavel" boolean DEFAULT false NOT NULL,
	"executada_em" timestamp with time zone,
	CONSTRAINT "designacoes_rodada_exame_key" UNIQUE("rodada_id","id_exame_mobilemed")
);
--> statement-breakpoint
CREATE TABLE "eventos_rodada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rodada_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"texto" text NOT NULL,
	"atual" integer,
	"total" integer
);
--> statement-breakpoint
CREATE TABLE "rodadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "status_rodada" DEFAULT 'solicitada' NOT NULL,
	"solicitada_por_id" uuid,
	"aprovada_por_id" uuid,
	"aprovada_em" timestamp with time zone,
	"turno_ids" uuid[] DEFAULT '{}' NOT NULL,
	"frente_ids" uuid[] DEFAULT '{}' NOT NULL,
	"prioridade_operacao_ids" uuid[] DEFAULT '{}' NOT NULL,
	"cliente_ids" uuid[] DEFAULT '{}' NOT NULL,
	"medicos_excluidos" uuid[] DEFAULT '{}' NOT NULL,
	"medicos_incluidos" uuid[] DEFAULT '{}' NOT NULL,
	"lida_em" timestamp with time zone,
	"expira_em" timestamp with time zone,
	"erro" text,
	"avisos" text[] DEFAULT '{}' NOT NULL,
	"lidos" integer DEFAULT 0 NOT NULL,
	"urgentes" integer DEFAULT 0 NOT NULL,
	"insumos" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao" ADD COLUMN "robo_ativo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao" ADD COLUMN "expiracao_proposta_min" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao" ADD COLUMN "teto_por_rodada" integer;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_rodada_id_rodadas_id_fk" FOREIGN KEY ("rodada_id") REFERENCES "public"."rodadas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_exame_id_exames_id_fk" FOREIGN KEY ("exame_id") REFERENCES "public"."exames"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_prioridade_operacao_id_prioridades_operacao_id_fk" FOREIGN KEY ("prioridade_operacao_id") REFERENCES "public"."prioridades_operacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_subespecialidade_id_subespecialidades_id_fk" FOREIGN KEY ("subespecialidade_id") REFERENCES "public"."subespecialidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_medico_proposto_id_medicos_id_fk" FOREIGN KEY ("medico_proposto_id") REFERENCES "public"."medicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_alocacao_gratificada_id_alocacoes_id_fk" FOREIGN KEY ("alocacao_gratificada_id") REFERENCES "public"."alocacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_cobertura_de_id_alocacoes_id_fk" FOREIGN KEY ("cobertura_de_id") REFERENCES "public"."alocacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_rodada" ADD CONSTRAINT "eventos_rodada_rodada_id_rodadas_id_fk" FOREIGN KEY ("rodada_id") REFERENCES "public"."rodadas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rodadas" ADD CONSTRAINT "rodadas_solicitada_por_id_usuarios_id_fk" FOREIGN KEY ("solicitada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rodadas" ADD CONSTRAINT "rodadas_aprovada_por_id_usuarios_id_fk" FOREIGN KEY ("aprovada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designacoes_rodada_status_idx" ON "designacoes" USING btree ("rodada_id","status");--> statement-breakpoint
CREATE INDEX "designacoes_rodada_ordem_idx" ON "designacoes" USING btree ("rodada_id","ordem");--> statement-breakpoint
CREATE INDEX "designacoes_exame_executadas_idx" ON "designacoes" USING btree ("id_exame_mobilemed","executada_em") WHERE "designacoes"."status" = 'executada';--> statement-breakpoint
CREATE INDEX "designacoes_alocacao_gratificada_idx" ON "designacoes" USING btree ("alocacao_gratificada_id","executada_em") WHERE "designacoes"."status" = 'executada' and "designacoes"."alocacao_gratificada_id" is not null;--> statement-breakpoint
CREATE INDEX "designacoes_medico_idx" ON "designacoes" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "eventos_rodada_rodada_em_idx" ON "eventos_rodada" USING btree ("rodada_id","em");--> statement-breakpoint
CREATE UNIQUE INDEX "rodadas_uma_viva_key" ON "rodadas" USING btree ((true)) WHERE "rodadas"."status" in ('solicitada', 'lendo', 'aguardando_aprovacao', 'aprovada', 'executando', 'pausada', 'parcial');--> statement-breakpoint
CREATE INDEX "rodadas_criado_em_idx" ON "rodadas" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "rodadas_status_idx" ON "rodadas" USING btree ("status");