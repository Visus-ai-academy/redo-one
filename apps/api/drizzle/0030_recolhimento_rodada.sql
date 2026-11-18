ALTER TABLE "designacoes" ADD COLUMN "recolhido_de_id" uuid;--> statement-breakpoint
ALTER TABLE "designacoes" ADD COLUMN "motivo_recolhimento" text;--> statement-breakpoint
ALTER TABLE "rodadas" ADD COLUMN "recolhidos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_recolhido_de_id_medicos_id_fk" FOREIGN KEY ("recolhido_de_id") REFERENCES "public"."medicos"("id") ON DELETE set null ON UPDATE no action;