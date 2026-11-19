ALTER TABLE "rodadas" ADD COLUMN "subespecialidade_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "rodadas" ADD COLUMN "subespecialidade_geral" boolean DEFAULT false NOT NULL;