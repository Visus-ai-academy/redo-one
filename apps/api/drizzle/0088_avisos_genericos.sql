CREATE TABLE "avisos_entidades" (
	"aviso_id" uuid NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	CONSTRAINT "avisos_entidades_aviso_id_entidade_entidade_id_pk" PRIMARY KEY("aviso_id","entidade","entidade_id")
);
--> statement-breakpoint
CREATE TABLE "tipos_aviso" (
	"tipo" text PRIMARY KEY NOT NULL,
	"impede_fechar_competencia" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tipos_aviso_responsaveis" (
	"tipo" text NOT NULL,
	"papel_id" uuid NOT NULL,
	CONSTRAINT "tipos_aviso_responsaveis_tipo_papel_id_pk" PRIMARY KEY("tipo","papel_id")
);
--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ALTER COLUMN "tipo" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "competencias" ADD COLUMN "fechada_com_avisos_motivo" text;--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ADD COLUMN "origem" text DEFAULT 'importacao' NOT NULL;--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ADD COLUMN "competencia_desde" text;--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ADD COLUMN "competencia_ate" text;--> statement-breakpoint
ALTER TABLE "avisos_entidades" ADD CONSTRAINT "avisos_entidades_aviso_id_avisos_cadastro_id_fk" FOREIGN KEY ("aviso_id") REFERENCES "public"."avisos_cadastro"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_aviso_responsaveis" ADD CONSTRAINT "tipos_aviso_responsaveis_tipo_tipos_aviso_tipo_fk" FOREIGN KEY ("tipo") REFERENCES "public"."tipos_aviso"("tipo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_aviso_responsaveis" ADD CONSTRAINT "tipos_aviso_responsaveis_papel_id_papeis_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papeis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avisos_entidades_entidade_idx" ON "avisos_entidades" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "tipos_aviso_responsaveis_papel_idx" ON "tipos_aviso_responsaveis" USING btree ("papel_id");--> statement-breakpoint
CREATE INDEX "avisos_cadastro_pendentes_idx" ON "avisos_cadastro" USING btree ("tipo","primeira_vez_em") WHERE "avisos_cadastro"."status" = 'pendente';--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ADD CONSTRAINT "avisos_cadastro_origem_check" CHECK ("avisos_cadastro"."origem" in ('importacao', 'rodada', 'carga', 'tela', 'job'));--> statement-breakpoint
ALTER TABLE "avisos_cadastro" ADD CONSTRAINT "avisos_cadastro_competencias_check" CHECK ("avisos_cadastro"."competencia_ate" is null or ("avisos_cadastro"."competencia_desde" is not null and "avisos_cadastro"."competencia_ate" >= "avisos_cadastro"."competencia_desde"));--> statement-breakpoint
DROP TYPE "public"."tipo_aviso_cadastro";