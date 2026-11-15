ALTER TABLE "clientes" ADD COLUMN "unificado_em_id" uuid;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_unificado_em_id_clientes_id_fk" FOREIGN KEY ("unificado_em_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_unificado_em_idx" ON "clientes" USING btree ("unificado_em_id");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_unificado_em_check" CHECK ("clientes"."unificado_em_id" <> "clientes"."id");