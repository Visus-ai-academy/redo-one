CREATE TABLE "clientes_dados_fiscais" (
	"cliente_id" uuid PRIMARY KEY NOT NULL,
	"emails_nf" text[] DEFAULT '{}'::text[] NOT NULL,
	"email" text,
	"contato_nome" text,
	"telefone" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"banco_codigo" text,
	"banco_agencia" text,
	"banco_conta" text,
	"omie_codigo_cliente" text,
	"omie_sincronizado_em" timestamp with time zone,
	"exclusao_fiscal" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por_id" uuid
);
--> statement-breakpoint
ALTER TABLE "clientes_dados_fiscais" ADD CONSTRAINT "clientes_dados_fiscais_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_dados_fiscais" ADD CONSTRAINT "clientes_dados_fiscais_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_dados_fiscais_exclusao_fiscal_idx" ON "clientes_dados_fiscais" USING btree ("exclusao_fiscal");