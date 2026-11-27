CREATE TYPE "public"."forma_baixa" AS ENUM('pix', 'boleto', 'ted', 'dinheiro', 'cartao', 'outro');--> statement-breakpoint
CREATE TYPE "public"."origem_baixa" AS ENUM('manual', 'banco');--> statement-breakpoint
CREATE TYPE "public"."origem_titulo" AS ENUM('manual', 'faturamento', 'pre_pago', 'repasse', 'carga_omie');--> statement-breakpoint
CREATE TYPE "public"."situacao_titulo" AS ENUM('aberto', 'parcial', 'liquidado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_titulo" AS ENUM('receber', 'pagar');--> statement-breakpoint
CREATE TABLE "baixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo_id" uuid NOT NULL,
	"pago_em" date NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"principal_centavos" bigint NOT NULL,
	"juros_centavos" bigint DEFAULT 0 NOT NULL,
	"multa_centavos" bigint DEFAULT 0 NOT NULL,
	"desconto_centavos" bigint DEFAULT 0 NOT NULL,
	"valor_movimentado_centavos" bigint NOT NULL,
	"forma" "forma_baixa" NOT NULL,
	"observacao" text,
	"origem" "origem_baixa" DEFAULT 'manual' NOT NULL,
	"estornada_em" timestamp with time zone,
	"estornada_por_id" uuid,
	"motivo_estorno" text,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baixas_principal_check" CHECK ("baixas"."principal_centavos" > 0),
	CONSTRAINT "baixas_acrescimos_check" CHECK ("baixas"."juros_centavos" >= 0 and "baixas"."multa_centavos" >= 0 and "baixas"."desconto_centavos" >= 0),
	CONSTRAINT "baixas_movimentado_check" CHECK ("baixas"."valor_movimentado_centavos" = "baixas"."principal_centavos" + "baixas"."juros_centavos" + "baixas"."multa_centavos" - "baixas"."desconto_centavos" and "baixas"."valor_movimentado_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "titulos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_titulo" NOT NULL,
	"contratado_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"cliente_id" uuid,
	"fornecedor_id" uuid,
	"medico_id" uuid,
	"categoria_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"documento" text,
	"competencia" text,
	"emissao_em" date NOT NULL,
	"vencimento" date NOT NULL,
	"vencimento_original" date,
	"valor_centavos" bigint NOT NULL,
	"pago_centavos" bigint DEFAULT 0 NOT NULL,
	"conta_prevista_id" uuid,
	"situacao" "situacao_titulo" DEFAULT 'aberto' NOT NULL,
	"origem" "origem_titulo" DEFAULT 'manual' NOT NULL,
	"origem_id" uuid,
	"origem_versao" integer,
	"observacoes" text,
	"cancelado_em" timestamp with time zone,
	"cancelado_por_id" uuid,
	"motivo_cancelamento" text,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titulos_favorecido_check" CHECK (("titulos"."tipo" = 'receber' and "titulos"."cliente_id" is not null and "titulos"."fornecedor_id" is null and "titulos"."medico_id" is null) or ("titulos"."tipo" = 'pagar' and "titulos"."cliente_id" is null and num_nonnulls("titulos"."fornecedor_id", "titulos"."medico_id") = 1)),
	CONSTRAINT "titulos_valor_check" CHECK ("titulos"."valor_centavos" > 0),
	CONSTRAINT "titulos_pago_check" CHECK ("titulos"."pago_centavos" >= 0 and "titulos"."pago_centavos" <= "titulos"."valor_centavos"),
	CONSTRAINT "titulos_competencia_check" CHECK ("titulos"."competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "titulos_numeracao" (
	"contratado_id" uuid NOT NULL,
	"tipo" "tipo_titulo" NOT NULL,
	"ultimo" integer NOT NULL,
	CONSTRAINT "titulos_numeracao_contratado_id_tipo_pk" PRIMARY KEY("contratado_id","tipo")
);
--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_titulo_id_titulos_id_fk" FOREIGN KEY ("titulo_id") REFERENCES "public"."titulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_estornada_por_id_usuarios_id_fk" FOREIGN KEY ("estornada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_conta_prevista_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_prevista_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_cancelado_por_id_usuarios_id_fk" FOREIGN KEY ("cancelado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_numeracao" ADD CONSTRAINT "titulos_numeracao_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "baixas_titulo_idx" ON "baixas" USING btree ("titulo_id");--> statement-breakpoint
CREATE INDEX "baixas_conta_idx" ON "baixas" USING btree ("conta_bancaria_id","pago_em");--> statement-breakpoint
CREATE UNIQUE INDEX "titulos_numero_key" ON "titulos" USING btree ("contratado_id","tipo","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "titulos_origem_key" ON "titulos" USING btree ("origem","origem_id") WHERE "titulos"."origem_id" is not null;--> statement-breakpoint
CREATE INDEX "titulos_lista_idx" ON "titulos" USING btree ("contratado_id","tipo","situacao","vencimento");--> statement-breakpoint
CREATE INDEX "titulos_tipo_situacao_vencimento_idx" ON "titulos" USING btree ("tipo","situacao","vencimento");--> statement-breakpoint
CREATE INDEX "titulos_cliente_idx" ON "titulos" USING btree ("cliente_id","situacao");--> statement-breakpoint
CREATE INDEX "titulos_fornecedor_idx" ON "titulos" USING btree ("fornecedor_id");--> statement-breakpoint
CREATE INDEX "titulos_medico_idx" ON "titulos" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "titulos_categoria_idx" ON "titulos" USING btree ("categoria_id");