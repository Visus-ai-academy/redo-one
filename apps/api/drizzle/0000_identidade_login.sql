CREATE TABLE "papeis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"sistema" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "papeis_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "papeis_permissoes" (
	"papel_id" uuid NOT NULL,
	"permissao" text NOT NULL,
	CONSTRAINT "papeis_permissoes_papel_id_permissao_pk" PRIMARY KEY("papel_id","permissao")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"expira_absoluto_em" timestamp with time zone NOT NULL,
	"ultimo_uso_em" timestamp with time zone NOT NULL,
	"encerrada_em" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessoes_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tentativas_login" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"usuario_id" uuid,
	"sucesso" boolean NOT NULL,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"cpf" text,
	"senha_hash" text,
	"senha_alterada_em" timestamp with time zone,
	"papel_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"tentativas_falhas" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "usuarios_cpf_unique" UNIQUE("cpf")
);
--> statement-breakpoint
ALTER TABLE "papeis_permissoes" ADD CONSTRAINT "papeis_permissoes_papel_id_papeis_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papeis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentativas_login" ADD CONSTRAINT "tentativas_login_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_papel_id_papeis_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papeis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tentativas_login_ip_criado_em_idx" ON "tentativas_login" USING btree ("ip","criado_em");--> statement-breakpoint
CREATE INDEX "tentativas_login_usuario_id_criado_em_idx" ON "tentativas_login" USING btree ("usuario_id","criado_em");