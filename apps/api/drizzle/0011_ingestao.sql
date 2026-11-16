CREATE TYPE "public"."formato_importacao" AS ENUM('laudos', 'compartilhamento');--> statement-breakpoint
CREATE TYPE "public"."origem_importacao" AS ENUM('upload_manual', 'mobilemed');--> statement-breakpoint
CREATE TYPE "public"."origem_laudo" AS ENUM('normal', 'compartilhamento');--> statement-breakpoint
CREATE TYPE "public"."status_aviso_cadastro" AS ENUM('pendente', 'resolvido', 'ignorado');--> statement-breakpoint
CREATE TYPE "public"."status_importacao" AS ENUM('na_fila', 'processando', 'concluida', 'recusada', 'erro');--> statement-breakpoint
CREATE TYPE "public"."tipo_aviso_cadastro" AS ENUM('cliente', 'medico', 'estudo', 'modalidade', 'especialidade', 'prioridade');--> statement-breakpoint
CREATE TABLE "arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"nome_original" text NOT NULL,
	"tipo_conteudo" text NOT NULL,
	"tamanho_bytes" bigint,
	"contexto" text NOT NULL,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_em" timestamp with time zone,
	CONSTRAINT "arquivos_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "avisos_cadastro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_aviso_cadastro" NOT NULL,
	"chave" text NOT NULL,
	"valor" text NOT NULL,
	"status" "status_aviso_cadastro" DEFAULT 'pendente' NOT NULL,
	"ocorrencias" integer DEFAULT 0 NOT NULL,
	"primeira_vez_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_vez_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_importacao_id" uuid,
	"decidido_por_id" uuid,
	"decidido_em" timestamp with time zone,
	"motivo" text,
	CONSTRAINT "avisos_cadastro_tipo_chave_key" UNIQUE("tipo","chave")
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"origem" "origem_importacao" NOT NULL,
	"formato" "formato_importacao",
	"status" "status_importacao" DEFAULT 'na_fila' NOT NULL,
	"enviada_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	"janela_inicio" date,
	"janela_fim" date,
	"linhas_arquivo" integer,
	"inseridos" integer,
	"atualizados" integer,
	"inalterados" integer,
	"removidos" integer,
	"invalidas" integer,
	"ignoradas_competencia_fechada" integer,
	"erros_linhas" jsonb,
	"mensagem" text
);
--> statement-breakpoint
CREATE TABLE "laudos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identidade" text NOT NULL,
	"hash_conteudo" text NOT NULL,
	"importacao_id" uuid NOT NULL,
	"origem" "origem_laudo" NOT NULL,
	"empresa_origem" text NOT NULL,
	"cliente_id" uuid,
	"accession_number" text,
	"paciente_chave" text NOT NULL,
	"estudo" text NOT NULL,
	"exame_id" uuid,
	"modalidade_origem" text NOT NULL,
	"modalidade_id" uuid,
	"especialidade_origem" text,
	"especialidade_id" uuid,
	"categoria_id" uuid,
	"prioridade_origem" text NOT NULL,
	"prioridade_id" uuid,
	"medico_origem" text,
	"medico_id" uuid,
	"medico_reassinatura_origem" text,
	"medico_reassinatura_id" uuid,
	"valores" numeric(12, 2),
	"volume" numeric(12, 2) NOT NULL,
	"status" text NOT NULL,
	"duplicado" boolean DEFAULT false NOT NULL,
	"complementar" boolean DEFAULT false NOT NULL,
	"data_realizacao" timestamp with time zone NOT NULL,
	"data_transferencia" timestamp with time zone,
	"data_laudo" timestamp with time zone NOT NULL,
	"data_prazo" timestamp with time zone,
	"data_reassinatura" timestamp with time zone,
	"dia_laudo" date NOT NULL,
	"competencia" text NOT NULL,
	"removido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "laudos_identidade_unique" UNIQUE("identidade")
);
--> statement-breakpoint
CREATE TABLE "laudos_linhas_brutas" (
	"laudo_id" uuid NOT NULL,
	"importacao_id" uuid NOT NULL,
	"dados" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "laudos_linhas_brutas_laudo_id_importacao_id_pk" PRIMARY KEY("laudo_id","importacao_id")
);
--> statement-breakpoint
CREATE TABLE "laudos_pecas_quebra" (
	"laudo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"exame_id" uuid NOT NULL,
	"categoria_id" uuid,
	CONSTRAINT "laudos_pecas_quebra_laudo_id_ordem_pk" PRIMARY KEY("laudo_id","ordem")
);
--> statement-breakpoint
CREATE TABLE "parametros_ingestao" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"trava_remocao_minimo" integer DEFAULT 500 NOT NULL,
	"trava_remocao_fator" numeric(6, 2) DEFAULT 2 NOT NULL,
	"retencao_linhas_brutas_dias" integer DEFAULT 90 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parametros_ingestao_unica" CHECK ("parametros_ingestao"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "totais_laudos_dia" (
	"dia" date NOT NULL,
	"cliente_id" uuid,
	"modalidade_id" uuid,
	"especialidade_id" uuid,
	"prioridade_id" uuid,
	"medico_id" uuid,
	"status" text NOT NULL,
	"quantidade" integer NOT NULL,
	"volume" numeric(14, 2) NOT NULL,
	"com_prazo" integer NOT NULL,
	"atrasados" integer NOT NULL,
	"soma_tat_minutos" bigint NOT NULL,
	"soma_atraso_minutos" bigint NOT NULL,
	CONSTRAINT "totais_laudos_dia_chave_key" UNIQUE NULLS NOT DISTINCT("dia","cliente_id","modalidade_id","especialidade_id","prioridade_id","medico_id","status")
);
--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ADD CONSTRAINT "avisos_cadastro_ultima_importacao_id_importacoes_id_fk" FOREIGN KEY ("ultima_importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ADD CONSTRAINT "avisos_cadastro_decidido_por_id_usuarios_id_fk" FOREIGN KEY ("decidido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_enviada_por_id_usuarios_id_fk" FOREIGN KEY ("enviada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_exame_id_exames_id_fk" FOREIGN KEY ("exame_id") REFERENCES "public"."exames"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos" ADD CONSTRAINT "laudos_medico_reassinatura_id_medicos_id_fk" FOREIGN KEY ("medico_reassinatura_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos_linhas_brutas" ADD CONSTRAINT "laudos_linhas_brutas_laudo_id_laudos_id_fk" FOREIGN KEY ("laudo_id") REFERENCES "public"."laudos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos_linhas_brutas" ADD CONSTRAINT "laudos_linhas_brutas_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos_pecas_quebra" ADD CONSTRAINT "laudos_pecas_quebra_laudo_id_laudos_id_fk" FOREIGN KEY ("laudo_id") REFERENCES "public"."laudos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos_pecas_quebra" ADD CONSTRAINT "laudos_pecas_quebra_exame_id_exames_id_fk" FOREIGN KEY ("exame_id") REFERENCES "public"."exames"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laudos_pecas_quebra" ADD CONSTRAINT "laudos_pecas_quebra_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totais_laudos_dia" ADD CONSTRAINT "totais_laudos_dia_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totais_laudos_dia" ADD CONSTRAINT "totais_laudos_dia_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totais_laudos_dia" ADD CONSTRAINT "totais_laudos_dia_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totais_laudos_dia" ADD CONSTRAINT "totais_laudos_dia_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totais_laudos_dia" ADD CONSTRAINT "totais_laudos_dia_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arquivos_contexto_criado_idx" ON "arquivos" USING btree ("contexto","criado_em");--> statement-breakpoint
CREATE INDEX "avisos_cadastro_status_idx" ON "avisos_cadastro" USING btree ("status","tipo");--> statement-breakpoint
CREATE INDEX "importacoes_criada_idx" ON "importacoes" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "importacoes_status_idx" ON "importacoes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "laudos_janela_idx" ON "laudos" USING btree ("origem","dia_laudo");--> statement-breakpoint
CREATE INDEX "laudos_competencia_idx" ON "laudos" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "laudos_cliente_idx" ON "laudos" USING btree ("cliente_id","dia_laudo");--> statement-breakpoint
CREATE INDEX "laudos_medico_idx" ON "laudos" USING btree ("medico_id","dia_laudo");--> statement-breakpoint
CREATE INDEX "laudos_exame_idx" ON "laudos" USING btree ("exame_id");--> statement-breakpoint
CREATE INDEX "laudos_linhas_brutas_criado_idx" ON "laudos_linhas_brutas" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "totais_laudos_dia_cliente_idx" ON "totais_laudos_dia" USING btree ("cliente_id","dia");--> statement-breakpoint
CREATE INDEX "totais_laudos_dia_medico_idx" ON "totais_laudos_dia" USING btree ("medico_id","dia");