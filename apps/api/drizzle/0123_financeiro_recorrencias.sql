CREATE TYPE "public"."ajuste_dia_nao_util" AS ENUM('antecipa', 'posterga', 'mantem');--> statement-breakpoint
CREATE TYPE "public"."frequencia_recorrencia" AS ENUM('semanal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual');--> statement-breakpoint
CREATE TYPE "public"."modo_valor_recorrencia" AS ENUM('fixo', 'previsto');--> statement-breakpoint
CREATE TYPE "public"."situacao_recorrencia" AS ENUM('ativa', 'pausada', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."termino_recorrencia" AS ENUM('sem', 'data', 'ocorrencias');--> statement-breakpoint
ALTER TYPE "public"."origem_titulo" ADD VALUE 'recorrencia';--> statement-breakpoint
CREATE TABLE "recorrencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_titulo" NOT NULL,
	"contratado_id" uuid NOT NULL,
	"cliente_id" uuid,
	"fornecedor_id" uuid,
	"medico_id" uuid,
	"categoria_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"modo_valor" "modo_valor_recorrencia" DEFAULT 'fixo' NOT NULL,
	"frequencia" "frequencia_recorrencia" NOT NULL,
	"dia_vencimento" integer,
	"primeiro_vencimento" date NOT NULL,
	"ajuste_dia_nao_util" "ajuste_dia_nao_util",
	"termino" "termino_recorrencia" DEFAULT 'sem' NOT NULL,
	"termino_em" date,
	"termino_ocorrencias" integer,
	"conta_prevista_id" uuid,
	"observacoes" text,
	"situacao" "situacao_recorrencia" DEFAULT 'ativa' NOT NULL,
	"gera_a_partir_de" date NOT NULL,
	"encerrada_em" timestamp with time zone,
	"encerrada_por_id" uuid,
	"motivo_encerramento" text,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recorrencias_favorecido_check" CHECK (("recorrencias"."tipo" = 'receber' and "recorrencias"."cliente_id" is not null and "recorrencias"."fornecedor_id" is null and "recorrencias"."medico_id" is null) or ("recorrencias"."tipo" = 'pagar' and "recorrencias"."cliente_id" is null and num_nonnulls("recorrencias"."fornecedor_id", "recorrencias"."medico_id") = 1)),
	CONSTRAINT "recorrencias_valor_check" CHECK ("recorrencias"."valor_centavos" > 0),
	CONSTRAINT "recorrencias_dia_check" CHECK (("recorrencias"."frequencia" = 'semanal') = ("recorrencias"."dia_vencimento" is null) and coalesce("recorrencias"."dia_vencimento" between 1 and 31, true)),
	CONSTRAINT "recorrencias_termino_check" CHECK (("recorrencias"."termino" = 'data') = ("recorrencias"."termino_em" is not null) and ("recorrencias"."termino" = 'ocorrencias') = ("recorrencias"."termino_ocorrencias" is not null))
);
--> statement-breakpoint
ALTER TABLE "configuracoes_financeiras" ADD COLUMN "horizonte_recorrencia_meses" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracoes_financeiras" ADD COLUMN "ajuste_dia_nao_util" "ajuste_dia_nao_util" DEFAULT 'posterga' NOT NULL;--> statement-breakpoint
ALTER TABLE "titulos" ADD COLUMN "recorrencia_id" uuid;--> statement-breakpoint
ALTER TABLE "titulos" ADD COLUMN "ocorrencia" integer;--> statement-breakpoint
ALTER TABLE "titulos" ADD COLUMN "editado_a_mao" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_conta_prevista_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_prevista_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_encerrada_por_id_usuarios_id_fk" FOREIGN KEY ("encerrada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recorrencias_lista_idx" ON "recorrencias" USING btree ("contratado_id","tipo","situacao");--> statement-breakpoint
CREATE INDEX "recorrencias_tipo_situacao_idx" ON "recorrencias" USING btree ("tipo","situacao");--> statement-breakpoint
CREATE INDEX "recorrencias_cliente_idx" ON "recorrencias" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "recorrencias_fornecedor_idx" ON "recorrencias" USING btree ("fornecedor_id");--> statement-breakpoint
CREATE INDEX "recorrencias_medico_idx" ON "recorrencias" USING btree ("medico_id");--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_recorrencia_id_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."recorrencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "titulos_recorrencia_ocorrencia_key" ON "titulos" USING btree ("recorrencia_id","ocorrencia") WHERE "titulos"."recorrencia_id" is not null;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_recorrencia_check" CHECK (("titulos"."recorrencia_id" is null) = ("titulos"."ocorrencia" is null));