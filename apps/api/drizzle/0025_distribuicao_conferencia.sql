ALTER TABLE "designacoes" ADD COLUMN "retirado_de_id" uuid;--> statement-breakpoint
ALTER TABLE "designacoes" ADD COLUMN "retirada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "designacoes" ADD COLUMN "na_mao" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "designacoes" ADD COLUMN "elegiveis" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "designacoes" ADD COLUMN "barrados" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rodadas" ADD COLUMN "retomadas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "designacoes" ADD CONSTRAINT "designacoes_retirado_de_id_medicos_id_fk" FOREIGN KEY ("retirado_de_id") REFERENCES "public"."medicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designacoes_exame_retiradas_idx" ON "designacoes" USING btree ("id_exame_mobilemed","retirada_em") WHERE "designacoes"."retirado_de_id" is not null;