ALTER TABLE "clientes_tipificacao_versoes" DROP CONSTRAINT "clientes_tipificacao_versoes_vigencia_check";--> statement-breakpoint
ALTER TABLE "regras_tipificacao_fatura" DROP CONSTRAINT "regras_tipificacao_fatura_vigencia_check";--> statement-breakpoint
ALTER TABLE "subregras_tipificacao_fatura" DROP CONSTRAINT "subregras_tipificacao_fatura_vigencia_check";--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_versoes" ALTER COLUMN "vigencia_desde" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "regras_tipificacao_fatura" ALTER COLUMN "vigencia_desde" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subregras_tipificacao_fatura" ALTER COLUMN "vigencia_desde" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes_tipificacao_versoes" ADD CONSTRAINT "clientes_tipificacao_versoes_vigencia_check" CHECK (("clientes_tipificacao_versoes"."vigencia_desde" is null or "clientes_tipificacao_versoes"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("clientes_tipificacao_versoes"."vigencia_ate" is null or "clientes_tipificacao_versoes"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("clientes_tipificacao_versoes"."vigencia_desde" is null or "clientes_tipificacao_versoes"."vigencia_ate" is null or "clientes_tipificacao_versoes"."vigencia_ate" >= "clientes_tipificacao_versoes"."vigencia_desde"));--> statement-breakpoint
ALTER TABLE "regras_tipificacao_fatura" ADD CONSTRAINT "regras_tipificacao_fatura_vigencia_check" CHECK (("regras_tipificacao_fatura"."vigencia_desde" is null or "regras_tipificacao_fatura"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("regras_tipificacao_fatura"."vigencia_ate" is null or "regras_tipificacao_fatura"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("regras_tipificacao_fatura"."vigencia_desde" is null or "regras_tipificacao_fatura"."vigencia_ate" is null or "regras_tipificacao_fatura"."vigencia_ate" >= "regras_tipificacao_fatura"."vigencia_desde"));--> statement-breakpoint
ALTER TABLE "subregras_tipificacao_fatura" ADD CONSTRAINT "subregras_tipificacao_fatura_vigencia_check" CHECK (("subregras_tipificacao_fatura"."vigencia_desde" is null or "subregras_tipificacao_fatura"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("subregras_tipificacao_fatura"."vigencia_ate" is null or "subregras_tipificacao_fatura"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("subregras_tipificacao_fatura"."vigencia_desde" is null or "subregras_tipificacao_fatura"."vigencia_ate" is null or "subregras_tipificacao_fatura"."vigencia_ate" >= "subregras_tipificacao_fatura"."vigencia_desde"));