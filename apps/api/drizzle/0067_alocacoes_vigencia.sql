CREATE TYPE "public"."vigencia_alocacao" AS ENUM('fixa', 'periodo');--> statement-breakpoint
ALTER TABLE "alocacoes" ADD COLUMN "vigencia" "vigencia_alocacao";