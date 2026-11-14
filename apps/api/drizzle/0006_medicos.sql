CREATE TYPE "public"."funcao_medico" AS ENUM('STAFF', 'FELLOW');--> statement-breakpoint
CREATE TYPE "public"."origem_alias_medico" AS ENUM('manual', 'volumetria', 'repasse', 'repasse_upload');--> statement-breakpoint
CREATE TYPE "public"."tipo_chave_pix" AS ENUM('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');--> statement-breakpoint
CREATE TABLE "equipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"plantao" boolean DEFAULT false NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipes_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "equipes_membros" (
	"equipe_id" uuid NOT NULL,
	"medico_id" uuid NOT NULL,
	CONSTRAINT "equipes_membros_equipe_id_medico_id_pk" PRIMARY KEY("equipe_id","medico_id")
);
--> statement-breakpoint
CREATE TABLE "medicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"chave_normalizada" text NOT NULL,
	"crm" text,
	"id_mobilemed" integer,
	"email" text,
	"telefone" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"oculto_dashboards" boolean DEFAULT false NOT NULL,
	"senior" boolean DEFAULT false NOT NULL,
	"fellowship" boolean DEFAULT false NOT NULL,
	"funcao" "funcao_medico",
	"nivel_id" uuid,
	"data_inicio_vinculo" date,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicos_chave_normalizada_unique" UNIQUE("chave_normalizada"),
	CONSTRAINT "medicos_id_mobilemed_unique" UNIQUE("id_mobilemed")
);
--> statement-breakpoint
CREATE TABLE "medicos_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"nome_origem" text NOT NULL,
	"chave_normalizada" text NOT NULL,
	"origem" "origem_alias_medico" DEFAULT 'manual' NOT NULL,
	"verificado_manualmente" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicos_aliases_chave_normalizada_unique" UNIQUE("chave_normalizada")
);
--> statement-breakpoint
CREATE TABLE "medicos_dados_pagamento" (
	"medico_id" uuid PRIMARY KEY NOT NULL,
	"cpf" text,
	"cnpj" text,
	"razao_social" text,
	"tipo_chave_pix" "tipo_chave_pix",
	"chave_pix" text,
	"socio" boolean,
	"optante_simples" boolean,
	"omie_codigo_fornecedor" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niveis_medico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"cor" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "niveis_medico_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "medico_id" uuid;--> statement-breakpoint
ALTER TABLE "equipes_membros" ADD CONSTRAINT "equipes_membros_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipes_membros" ADD CONSTRAINT "equipes_membros_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicos" ADD CONSTRAINT "medicos_nivel_id_niveis_medico_id_fk" FOREIGN KEY ("nivel_id") REFERENCES "public"."niveis_medico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicos_aliases" ADD CONSTRAINT "medicos_aliases_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicos_dados_pagamento" ADD CONSTRAINT "medicos_dados_pagamento_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipes_membros_medico_idx" ON "equipes_membros" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "medicos_ativo_idx" ON "medicos" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "medicos_oculto_dashboards_idx" ON "medicos" USING btree ("oculto_dashboards");--> statement-breakpoint
CREATE INDEX "medicos_nivel_idx" ON "medicos" USING btree ("nivel_id");--> statement-breakpoint
CREATE INDEX "medicos_aliases_medico_idx" ON "medicos_aliases" USING btree ("medico_id");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_medico_id_unique" UNIQUE("medico_id");