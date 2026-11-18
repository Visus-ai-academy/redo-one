CREATE TABLE "prioridades_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"especialidade_id" uuid,
	"modalidade_id" uuid,
	"nivel" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prioridades_cliente_frente_check" CHECK (("prioridades_cliente"."especialidade_id" is null) <> ("prioridades_cliente"."modalidade_id" is null)),
	CONSTRAINT "prioridades_cliente_nivel_check" CHECK ("prioridades_cliente"."nivel" in (1, 2))
);
--> statement-breakpoint
ALTER TABLE "prioridades_cliente" ADD CONSTRAINT "prioridades_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prioridades_cliente" ADD CONSTRAINT "prioridades_cliente_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prioridades_cliente" ADD CONSTRAINT "prioridades_cliente_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prioridades_cliente_especialidade_key" ON "prioridades_cliente" USING btree ("cliente_id","especialidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prioridades_cliente_modalidade_key" ON "prioridades_cliente" USING btree ("cliente_id","modalidade_id");