ALTER TABLE "frentes_escala" DROP CONSTRAINT "frentes_escala_rotulo_unique";--> statement-breakpoint
DROP INDEX "frentes_escala_ativo_ordem_idx";--> statement-breakpoint
ALTER TABLE "frentes_escala" DROP COLUMN "rotulo";--> statement-breakpoint
ALTER TABLE "frentes_escala" DROP COLUMN "descricao";--> statement-breakpoint
ALTER TABLE "frentes_escala" DROP COLUMN "cor";--> statement-breakpoint
ALTER TABLE "frentes_escala" DROP COLUMN "ordem";--> statement-breakpoint
ALTER TABLE "frentes_escala" DROP COLUMN "ativo";--> statement-breakpoint
ALTER TABLE "frentes_escala" DROP COLUMN "atualizado_em";