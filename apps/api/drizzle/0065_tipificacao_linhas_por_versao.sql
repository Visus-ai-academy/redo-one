ALTER TABLE "clientes_tipificacao_linhas" DROP CONSTRAINT "clientes_tipificacao_linhas_ordem_key";--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" DROP CONSTRAINT "clientes_tipificacao_linhas_cliente_id_clientes_tipificacao_cliente_id_fk";
--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" ALTER COLUMN "versao_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" DROP COLUMN "cliente_id";--> statement-breakpoint
ALTER TABLE "regras_tipificacao" DROP COLUMN "fatura_sem_subregra";--> statement-breakpoint
ALTER TABLE "subregras_tipificacao" DROP COLUMN "fatura";--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_linhas" ADD CONSTRAINT "clientes_tipificacao_linhas_versao_ordem_key" UNIQUE("versao_id","ordem");