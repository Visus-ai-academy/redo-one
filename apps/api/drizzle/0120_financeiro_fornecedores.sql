CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_pessoa" "tipo_pessoa" NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text,
	"cnpj" text,
	"cpf" text,
	"email" text,
	"telefone" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"tipo_chave_pix" "tipo_chave_pix",
	"chave_pix" text,
	"banco_codigo" text,
	"agencia" text,
	"conta" text,
	"categoria_padrao_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_documento_check" CHECK (("fornecedores"."tipo_pessoa" = 'PJ' and "fornecedores"."cnpj" is not null and "fornecedores"."cpf" is null) or ("fornecedores"."tipo_pessoa" = 'PF' and "fornecedores"."cpf" is not null and "fornecedores"."cnpj" is null))
);
--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_categoria_padrao_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_padrao_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedores_cnpj_key" ON "fornecedores" USING btree ("cnpj") WHERE "fornecedores"."cnpj" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedores_cpf_key" ON "fornecedores" USING btree ("cpf") WHERE "fornecedores"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "fornecedores_razao_social_idx" ON "fornecedores" USING btree (lower("razao_social"));--> statement-breakpoint
CREATE INDEX "fornecedores_ativo_idx" ON "fornecedores" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "fornecedores_categoria_padrao_idx" ON "fornecedores" USING btree ("categoria_padrao_id");