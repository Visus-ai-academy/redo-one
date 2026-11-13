CREATE TABLE "chaves_robo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"prefixo" text NOT NULL,
	"token_hash" text NOT NULL,
	"permissoes" text[] NOT NULL,
	"expira_em" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	"ultimo_uso_em" timestamp with time zone,
	"ultimo_ip" text,
	"criada_por_id" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chaves_robo_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "chaves_robo" ADD CONSTRAINT "chaves_robo_criada_por_id_usuarios_id_fk" FOREIGN KEY ("criada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;