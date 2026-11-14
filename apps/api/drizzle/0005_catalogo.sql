CREATE TYPE "public"."tipo_alias_cliente" AS ENUM('exato', 'prefixo', 'normalizado');--> statement-breakpoint
CREATE TYPE "public"."tipo_de_para_especialidade" AS ENUM('normalizacao', 'invalida', 'regiao_anatomica');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('PJ', 'PF');--> statement-breakpoint
CREATE TABLE "categorias_exame" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_exame_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"chave_normalizada" text NOT NULL,
	"nome_fantasia" text,
	"razao_social" text,
	"tipo_pessoa" "tipo_pessoa",
	"cnpj" text,
	"cpf" text,
	"contratado_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"oculto_dashboards" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "clientes_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tipo" "tipo_alias_cliente" NOT NULL,
	"padrao" text NOT NULL,
	"chave" text NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_aliases_tipo_chave_key" UNIQUE("tipo","chave")
);
--> statement-breakpoint
CREATE TABLE "contratados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razao_social" text NOT NULL,
	"cnpj" text,
	"endereco" text,
	"cidade" text,
	"uf" text,
	"cep" text,
	"contratado_repasse_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contratados_razao_social_unique" UNIQUE("razao_social"),
	CONSTRAINT "contratados_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "especialidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "especialidades_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "especialidades_de_para" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_de_para_especialidade" NOT NULL,
	"origem" text NOT NULL,
	"especialidade_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "especialidades_de_para_tipo_origem_key" UNIQUE("tipo","origem"),
	CONSTRAINT "especialidades_de_para_destino_check" CHECK (("especialidades_de_para"."tipo" = 'invalida') = ("especialidades_de_para"."especialidade_id" is null))
);
--> statement-breakpoint
CREATE TABLE "exames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"chave_normalizada" text NOT NULL,
	"codigo" text,
	"descricao" text,
	"modalidade_id" uuid,
	"especialidade_id" uuid,
	"subespecialidade_id" uuid,
	"categoria_id" uuid,
	"prioridade_id" uuid,
	"permite_quebra" boolean DEFAULT false NOT NULL,
	"exige_revisao_manual" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exames_de_para_valores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estudo_descricao" text NOT NULL,
	"chave_normalizada" text NOT NULL,
	"valores" numeric(12, 2) NOT NULL,
	"exame_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exames_de_para_valores_chave_normalizada_unique" UNIQUE("chave_normalizada")
);
--> statement-breakpoint
CREATE TABLE "modalidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modalidades_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "prioridades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"urgente" boolean DEFAULT false NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prioridades_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "prioridades_de_para" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origem" text NOT NULL,
	"prioridade_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prioridades_de_para_origem_unique" UNIQUE("origem")
);
--> statement-breakpoint
CREATE TABLE "regras_quebra_exame" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exame_origem_id" uuid NOT NULL,
	"exame_destino_id" uuid NOT NULL,
	"categoria_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_quebra_exame_origem_destino_key" UNIQUE("exame_origem_id","exame_destino_id")
);
--> statement-breakpoint
CREATE TABLE "subespecialidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subespecialidades_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "subespecialidades_especialidades" (
	"subespecialidade_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	CONSTRAINT "subespecialidades_especialidades_subespecialidade_id_especialidade_id_pk" PRIMARY KEY("subespecialidade_id","especialidade_id")
);
--> statement-breakpoint
CREATE TABLE "sufixos_nome_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sufixo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sufixos_nome_cliente_sufixo_unique" UNIQUE("sufixo")
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_aliases" ADD CONSTRAINT "clientes_aliases_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratados" ADD CONSTRAINT "contratados_contratado_repasse_id_contratados_id_fk" FOREIGN KEY ("contratado_repasse_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "especialidades_de_para" ADD CONSTRAINT "especialidades_de_para_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exames" ADD CONSTRAINT "exames_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exames" ADD CONSTRAINT "exames_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exames" ADD CONSTRAINT "exames_subespecialidade_id_subespecialidades_id_fk" FOREIGN KEY ("subespecialidade_id") REFERENCES "public"."subespecialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exames" ADD CONSTRAINT "exames_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exames" ADD CONSTRAINT "exames_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exames_de_para_valores" ADD CONSTRAINT "exames_de_para_valores_exame_id_exames_id_fk" FOREIGN KEY ("exame_id") REFERENCES "public"."exames"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prioridades_de_para" ADD CONSTRAINT "prioridades_de_para_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_quebra_exame" ADD CONSTRAINT "regras_quebra_exame_exame_origem_id_exames_id_fk" FOREIGN KEY ("exame_origem_id") REFERENCES "public"."exames"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_quebra_exame" ADD CONSTRAINT "regras_quebra_exame_exame_destino_id_exames_id_fk" FOREIGN KEY ("exame_destino_id") REFERENCES "public"."exames"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_quebra_exame" ADD CONSTRAINT "regras_quebra_exame_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subespecialidades_especialidades" ADD CONSTRAINT "subespecialidades_especialidades_subespecialidade_id_subespecialidades_id_fk" FOREIGN KEY ("subespecialidade_id") REFERENCES "public"."subespecialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subespecialidades_especialidades" ADD CONSTRAINT "subespecialidades_especialidades_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorias_exame_ativo_ordem_idx" ON "categorias_exame" USING btree ("ativo","ordem");--> statement-breakpoint
CREATE INDEX "clientes_chave_normalizada_idx" ON "clientes" USING btree ("chave_normalizada");--> statement-breakpoint
CREATE INDEX "clientes_ativo_idx" ON "clientes" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "clientes_oculto_dashboards_idx" ON "clientes" USING btree ("oculto_dashboards");--> statement-breakpoint
CREATE INDEX "clientes_contratado_idx" ON "clientes" USING btree ("contratado_id");--> statement-breakpoint
CREATE INDEX "clientes_aliases_cliente_idx" ON "clientes_aliases" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "especialidades_ativo_ordem_idx" ON "especialidades" USING btree ("ativo","ordem");--> statement-breakpoint
CREATE INDEX "especialidades_de_para_especialidade_idx" ON "especialidades_de_para" USING btree ("especialidade_id");--> statement-breakpoint
CREATE INDEX "exames_chave_normalizada_idx" ON "exames" USING btree ("chave_normalizada");--> statement-breakpoint
CREATE INDEX "exames_nome_idx" ON "exames" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "exames_modalidade_idx" ON "exames" USING btree ("modalidade_id");--> statement-breakpoint
CREATE INDEX "exames_especialidade_idx" ON "exames" USING btree ("especialidade_id");--> statement-breakpoint
CREATE INDEX "exames_de_para_valores_exame_idx" ON "exames_de_para_valores" USING btree ("exame_id");--> statement-breakpoint
CREATE INDEX "modalidades_ativo_ordem_idx" ON "modalidades" USING btree ("ativo","ordem");--> statement-breakpoint
CREATE INDEX "prioridades_ativo_ordem_idx" ON "prioridades" USING btree ("ativo","ordem");--> statement-breakpoint
CREATE INDEX "prioridades_de_para_prioridade_idx" ON "prioridades_de_para" USING btree ("prioridade_id");--> statement-breakpoint
CREATE INDEX "regras_quebra_exame_destino_idx" ON "regras_quebra_exame" USING btree ("exame_destino_id");--> statement-breakpoint
CREATE INDEX "subespecialidades_ativo_ordem_idx" ON "subespecialidades" USING btree ("ativo","ordem");--> statement-breakpoint
CREATE INDEX "subespecialidades_especialidades_especialidade_idx" ON "subespecialidades_especialidades" USING btree ("especialidade_id");