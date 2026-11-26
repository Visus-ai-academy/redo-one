CREATE TABLE "demonstrativos_faturamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"vigente" boolean NOT NULL,
	"origem" text NOT NULL,
	"recalculo_id" uuid,
	"contratado_id" uuid,
	"laudos" integer NOT NULL,
	"quantidade" numeric(14, 2) NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"quantidade_sem_preco" numeric(14, 2) NOT NULL,
	"nada_a_faturar" boolean NOT NULL,
	"gerado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "demonstrativos_faturamento_versao_key" UNIQUE("competencia","cliente_id","versao"),
	CONSTRAINT "demonstrativos_faturamento_origem_check" CHECK ("demonstrativos_faturamento"."origem" in ('previa', 'fechamento', 'recalculo'))
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_faturamento_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demonstrativo_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"modalidade_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"unitario_centavos" bigint,
	"linha_preco_id" uuid,
	"origem_preco" text,
	"como_achou" text,
	"quantidade" numeric(14, 2) NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"laudos" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_faturamento_legado" (
	"id" uuid PRIMARY KEY NOT NULL,
	"competencia" text NOT NULL,
	"chave_grupo" text NOT NULL,
	"nome_fantasia" text NOT NULL,
	"contratado_id" uuid,
	"total_exames" numeric(14, 2) NOT NULL,
	"valor_exames_centavos" bigint NOT NULL,
	"valor_franquia_centavos" bigint NOT NULL,
	"valor_portal_centavos" bigint NOT NULL,
	"valor_integracao_centavos" bigint NOT NULL,
	"valor_bruto_centavos" bigint NOT NULL,
	"valor_impostos_centavos" bigint NOT NULL,
	"valor_liquido_centavos" bigint NOT NULL,
	"franquia_regra" text,
	"gerado_em" timestamp with time zone,
	CONSTRAINT "demonstrativos_faturamento_legado_grupo_key" UNIQUE("competencia","chave_grupo")
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_faturamento_legado_itens" (
	"demonstrativo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"modalidade" text NOT NULL,
	"especialidade" text NOT NULL,
	"categoria" text NOT NULL,
	"prioridade" text NOT NULL,
	"quantidade" numeric(14, 2) NOT NULL,
	"valor_unitario_centavos" bigint NOT NULL,
	"valor_total_centavos" bigint NOT NULL,
	"preco_padrao" boolean NOT NULL,
	CONSTRAINT "demonstrativos_faturamento_legado_itens_demonstrativo_id_ordem_pk" PRIMARY KEY("demonstrativo_id","ordem")
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_faturamento_legado_membros" (
	"demonstrativo_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	CONSTRAINT "demonstrativos_faturamento_legado_membros_demonstrativo_id_cliente_id_pk" PRIMARY KEY("demonstrativo_id","cliente_id")
);
--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento" ADD CONSTRAINT "demonstrativos_faturamento_competencia_competencias_competencia_fk" FOREIGN KEY ("competencia") REFERENCES "public"."competencias"("competencia") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento" ADD CONSTRAINT "demonstrativos_faturamento_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento" ADD CONSTRAINT "demonstrativos_faturamento_recalculo_id_recalculos_competencia_id_fk" FOREIGN KEY ("recalculo_id") REFERENCES "public"."recalculos_competencia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento" ADD CONSTRAINT "demonstrativos_faturamento_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_itens" ADD CONSTRAINT "demonstrativos_faturamento_itens_demonstrativo_id_demonstrativos_faturamento_id_fk" FOREIGN KEY ("demonstrativo_id") REFERENCES "public"."demonstrativos_faturamento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_itens" ADD CONSTRAINT "demonstrativos_faturamento_itens_membro_id_clientes_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_itens" ADD CONSTRAINT "demonstrativos_faturamento_itens_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_itens" ADD CONSTRAINT "demonstrativos_faturamento_itens_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_itens" ADD CONSTRAINT "demonstrativos_faturamento_itens_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_itens" ADD CONSTRAINT "demonstrativos_faturamento_itens_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_legado" ADD CONSTRAINT "demonstrativos_faturamento_legado_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_legado_itens" ADD CONSTRAINT "demonstrativos_faturamento_legado_itens_demonstrativo_id_demonstrativos_faturamento_legado_id_fk" FOREIGN KEY ("demonstrativo_id") REFERENCES "public"."demonstrativos_faturamento_legado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_legado_membros" ADD CONSTRAINT "demonstrativos_faturamento_legado_membros_demonstrativo_id_demonstrativos_faturamento_legado_id_fk" FOREIGN KEY ("demonstrativo_id") REFERENCES "public"."demonstrativos_faturamento_legado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_faturamento_legado_membros" ADD CONSTRAINT "demonstrativos_faturamento_legado_membros_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demonstrativos_faturamento_vigente_key" ON "demonstrativos_faturamento" USING btree ("competencia","cliente_id") WHERE "demonstrativos_faturamento"."vigente";--> statement-breakpoint
CREATE INDEX "demonstrativos_faturamento_competencia_idx" ON "demonstrativos_faturamento" USING btree ("competencia","vigente");--> statement-breakpoint
CREATE INDEX "demonstrativos_faturamento_itens_demonstrativo_idx" ON "demonstrativos_faturamento_itens" USING btree ("demonstrativo_id");