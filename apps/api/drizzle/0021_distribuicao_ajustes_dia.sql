CREATE TABLE "ajustes_dia_distribuicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alocacao_id" uuid NOT NULL,
	"data" date NOT NULL,
	"lista_segue_sla" boolean DEFAULT false NOT NULL,
	"cliente_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ajustes_dia_distribuicao_alocacao_data_key" UNIQUE("alocacao_id","data")
);
--> statement-breakpoint
CREATE TABLE "ajustes_dia_distribuicao_prioridades" (
	"ajuste_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	CONSTRAINT "ajustes_dia_distribuicao_prioridades_ajuste_id_prioridade_id_pk" PRIMARY KEY("ajuste_id","prioridade_id")
);
--> statement-breakpoint
ALTER TABLE "ajustes_dia_distribuicao" ADD CONSTRAINT "ajustes_dia_distribuicao_alocacao_id_alocacoes_id_fk" FOREIGN KEY ("alocacao_id") REFERENCES "public"."alocacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_dia_distribuicao" ADD CONSTRAINT "ajustes_dia_distribuicao_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_dia_distribuicao_prioridades" ADD CONSTRAINT "ajustes_dia_distribuicao_prioridades_ajuste_id_ajustes_dia_distribuicao_id_fk" FOREIGN KEY ("ajuste_id") REFERENCES "public"."ajustes_dia_distribuicao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_dia_distribuicao_prioridades" ADD CONSTRAINT "ajustes_dia_distribuicao_prioridades_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajustes_dia_distribuicao_data_idx" ON "ajustes_dia_distribuicao" USING btree ("data");