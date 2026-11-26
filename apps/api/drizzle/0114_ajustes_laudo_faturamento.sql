CREATE TABLE "ajustes_laudo_faturamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"laudo_identidade" text NOT NULL,
	"competencia" text NOT NULL,
	"cliente_id" uuid,
	"tipo" text NOT NULL,
	"valor_unitario_centavos" bigint,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	"criado_por_id" uuid NOT NULL,
	"encerrado_em" timestamp with time zone,
	"encerrado_por_id" uuid,
	"motivo_encerramento" text,
	CONSTRAINT "ajustes_laudo_faturamento_tipo_check" CHECK ("ajustes_laudo_faturamento"."tipo" in ('valor', 'excluir')),
	CONSTRAINT "ajustes_laudo_faturamento_valor_check" CHECK (("ajustes_laudo_faturamento"."tipo" = 'valor') = ("ajustes_laudo_faturamento"."valor_unitario_centavos" is not null) and coalesce("ajustes_laudo_faturamento"."valor_unitario_centavos", 0) >= 0),
	CONSTRAINT "ajustes_laudo_faturamento_motivo_check" CHECK (btrim("ajustes_laudo_faturamento"."motivo") <> ''),
	CONSTRAINT "ajustes_laudo_faturamento_encerramento_check" CHECK (("ajustes_laudo_faturamento"."encerrado_em" is null) = ("ajustes_laudo_faturamento"."encerrado_por_id" is null) and ("ajustes_laudo_faturamento"."encerrado_em" is null or btrim(coalesce("ajustes_laudo_faturamento"."motivo_encerramento", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "ajustes_laudo_faturamento" ADD CONSTRAINT "ajustes_laudo_faturamento_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_laudo_faturamento" ADD CONSTRAINT "ajustes_laudo_faturamento_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_laudo_faturamento" ADD CONSTRAINT "ajustes_laudo_faturamento_encerrado_por_id_usuarios_id_fk" FOREIGN KEY ("encerrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ajustes_laudo_faturamento_vigente_key" ON "ajustes_laudo_faturamento" USING btree ("laudo_identidade") WHERE "ajustes_laudo_faturamento"."encerrado_em" is null;--> statement-breakpoint
CREATE INDEX "ajustes_laudo_faturamento_competencia_idx" ON "ajustes_laudo_faturamento" USING btree ("competencia");