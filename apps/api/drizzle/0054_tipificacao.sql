CREATE TABLE "classificacoes_laudo" (
	"laudo_id" uuid PRIMARY KEY NOT NULL,
	"regra_id" uuid NOT NULL,
	"subregra_id" uuid,
	"fatura" boolean NOT NULL,
	"calculado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes_tipificacao" (
	"cliente_id" uuid PRIMARY KEY NOT NULL,
	"regra_id" uuid,
	"subregra_demais_id" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por_id" uuid
);
--> statement-breakpoint
CREATE TABLE "clientes_tipificacao_linhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text NOT NULL,
	"modo_medico" text DEFAULT 'todos' NOT NULL,
	"subregra_id" uuid NOT NULL,
	CONSTRAINT "clientes_tipificacao_linhas_ordem_key" UNIQUE("cliente_id","ordem"),
	CONSTRAINT "clientes_tipificacao_linhas_tipo_check" CHECK ("clientes_tipificacao_linhas"."tipo" in ('modalidade', 'especialidade', 'prioridade')),
	CONSTRAINT "clientes_tipificacao_linhas_modo_check" CHECK ("clientes_tipificacao_linhas"."modo_medico" in ('todos', 'apenas', 'exceto'))
);
--> statement-breakpoint
CREATE TABLE "clientes_tipificacao_linhas_equipes" (
	"linha_id" uuid NOT NULL,
	"equipe_id" uuid NOT NULL,
	CONSTRAINT "clientes_tipificacao_linhas_equipes_linha_id_equipe_id_pk" PRIMARY KEY("linha_id","equipe_id")
);
--> statement-breakpoint
CREATE TABLE "clientes_tipificacao_linhas_especialidades" (
	"linha_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	CONSTRAINT "clientes_tipificacao_linhas_especialidades_linha_id_especialidade_id_pk" PRIMARY KEY("linha_id","especialidade_id")
);
--> statement-breakpoint
CREATE TABLE "clientes_tipificacao_linhas_medicos" (
	"linha_id" uuid NOT NULL,
	"medico_id" uuid NOT NULL,
	CONSTRAINT "clientes_tipificacao_linhas_medicos_linha_id_medico_id_pk" PRIMARY KEY("linha_id","medico_id")
);
--> statement-breakpoint
CREATE TABLE "clientes_tipificacao_linhas_modalidades" (
	"linha_id" uuid NOT NULL,
	"modalidade_id" uuid NOT NULL,
	CONSTRAINT "clientes_tipificacao_linhas_modalidades_linha_id_modalidade_id_pk" PRIMARY KEY("linha_id","modalidade_id")
);
--> statement-breakpoint
CREATE TABLE "clientes_tipificacao_linhas_prioridades" (
	"linha_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	CONSTRAINT "clientes_tipificacao_linhas_prioridades_linha_id_prioridade_id_pk" PRIMARY KEY("linha_id","prioridade_id")
);
--> statement-breakpoint
CREATE TABLE "regras_tipificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"fatura_sem_subregra" boolean NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_tipificacao_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "subregras_tipificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regra_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"fatura" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subregras_tipificacao_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "laudos" ADD COLUMN "unidade_id" uuid;--> statement-breakpoint
ALTER TABLE "classificacoes_laudo" ADD CONSTRAINT "classificacoes_laudo_laudo_id_laudos_id_fk" FOREIGN KEY ("laudo_id") REFERENCES "public"."laudos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classificacoes_laudo" ADD CONSTRAINT "classificacoes_laudo_regra_id_regras_tipificacao_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classificacoes_laudo" ADD CONSTRAINT "classificacoes_laudo_subregra_id_subregras_tipificacao_id_fk" FOREIGN KEY ("subregra_id") REFERENCES "public"."subregras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao" ADD CONSTRAINT "clientes_tipificacao_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao" ADD CONSTRAINT "clientes_tipificacao_regra_id_regras_tipificacao_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao" ADD CONSTRAINT "clientes_tipificacao_subregra_demais_id_subregras_tipificacao_id_fk" FOREIGN KEY ("subregra_demais_id") REFERENCES "public"."subregras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao" ADD CONSTRAINT "clientes_tipificacao_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" ADD CONSTRAINT "clientes_tipificacao_linhas_cliente_id_clientes_tipificacao_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes_tipificacao"("cliente_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" ADD CONSTRAINT "clientes_tipificacao_linhas_subregra_id_subregras_tipificacao_id_fk" FOREIGN KEY ("subregra_id") REFERENCES "public"."subregras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_equipes" ADD CONSTRAINT "clientes_tipificacao_linhas_equipes_linha_id_clientes_tipificacao_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."clientes_tipificacao_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_equipes" ADD CONSTRAINT "clientes_tipificacao_linhas_equipes_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_especialidades" ADD CONSTRAINT "clientes_tipificacao_linhas_especialidades_linha_id_clientes_tipificacao_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."clientes_tipificacao_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_especialidades" ADD CONSTRAINT "clientes_tipificacao_linhas_especialidades_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_medicos" ADD CONSTRAINT "clientes_tipificacao_linhas_medicos_linha_id_clientes_tipificacao_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."clientes_tipificacao_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_medicos" ADD CONSTRAINT "clientes_tipificacao_linhas_medicos_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_modalidades" ADD CONSTRAINT "clientes_tipificacao_linhas_modalidades_linha_id_clientes_tipificacao_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."clientes_tipificacao_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_modalidades" ADD CONSTRAINT "clientes_tipificacao_linhas_modalidades_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_prioridades" ADD CONSTRAINT "clientes_tipificacao_linhas_prioridades_linha_id_clientes_tipificacao_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."clientes_tipificacao_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas_prioridades" ADD CONSTRAINT "clientes_tipificacao_linhas_prioridades_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subregras_tipificacao" ADD CONSTRAINT "subregras_tipificacao_regra_id_regras_tipificacao_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_tipificacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classificacoes_laudo_regra_idx" ON "classificacoes_laudo" USING btree ("regra_id");--> statement-breakpoint
CREATE INDEX "classificacoes_laudo_subregra_idx" ON "classificacoes_laudo" USING btree ("subregra_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_regra_idx" ON "clientes_tipificacao" USING btree ("regra_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_subregra_demais_idx" ON "clientes_tipificacao" USING btree ("subregra_demais_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_linhas_subregra_idx" ON "clientes_tipificacao_linhas" USING btree ("subregra_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_linhas_equipes_equipe_idx" ON "clientes_tipificacao_linhas_equipes" USING btree ("equipe_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_linhas_especialidades_especialidade_idx" ON "clientes_tipificacao_linhas_especialidades" USING btree ("especialidade_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_linhas_medicos_medico_idx" ON "clientes_tipificacao_linhas_medicos" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_linhas_modalidades_modalidade_idx" ON "clientes_tipificacao_linhas_modalidades" USING btree ("modalidade_id");--> statement-breakpoint
CREATE INDEX "clientes_tipificacao_linhas_prioridades_prioridade_idx" ON "clientes_tipificacao_linhas_prioridades" USING btree ("prioridade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regras_tipificacao_padrao_key" ON "regras_tipificacao" USING btree ("padrao") WHERE "regras_tipificacao"."padrao";--> statement-breakpoint
CREATE INDEX "subregras_tipificacao_regra_idx" ON "subregras_tipificacao" USING btree ("regra_id");--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_unidade_id_clientes_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;