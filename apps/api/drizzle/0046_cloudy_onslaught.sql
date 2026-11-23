CREATE TYPE "public"."unidade_teto" AS ENUM('exames', 'laudos');--> statement-breakpoint
ALTER TABLE "medicos_distribuicao" ADD COLUMN "unidade_teto" "unidade_teto" DEFAULT 'exames' NOT NULL;