CREATE TYPE "public"."aplicacao_retencao" AS ENUM('todos', 'pessoa_fisica', 'pessoa_juridica', 'pessoa_juridica_simples', 'pessoa_juridica_fora_simples');--> statement-breakpoint
CREATE TYPE "public"."origem_preco_repasse" AS ENUM('unidade', 'cliente', 'todos', 'tarifa_propria', 'sem_preco');--> statement-breakpoint
CREATE TYPE "public"."tipo_adicional_repasse" AS ENUM('avulso', 'peer_review', 'plantao');--> statement-breakpoint
CREATE TYPE "public"."tipo_geracao_repasse" AS ENUM('previa', 'recalculo');--> statement-breakpoint
CREATE TYPE "public"."tipo_item_repasse" AS ENUM('exames', 'adicional', 'regra', 'retencao');--> statement-breakpoint
CREATE TYPE "public"."tipo_regra_apuracao" AS ENUM('fixo', 'por_laudo', 'percentual_repasse', 'tarifa_laudo');--> statement-breakpoint
CREATE TABLE "adicionais_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" integer NOT NULL,
	"descricao" text NOT NULL,
	"tipo" "tipo_adicional_repasse" NOT NULL,
	"quantidade" integer,
	"valor_unitario_centavos" integer,
	"referencia_desde" text,
	"referencia_ate" text,
	"recalculo_id" uuid,
	"lancado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"lancado_por_id" uuid,
	"cancelado_em" timestamp with time zone,
	"cancelado_por_id" uuid,
	"motivo_cancelamento" text,
	CONSTRAINT "adicionais_repasse_valor_check" CHECK ("adicionais_repasse"."valor_centavos" <> 0),
	CONSTRAINT "adicionais_repasse_competencia_check" CHECK ("adicionais_repasse"."competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "adicionais_repasse_quantidade_check" CHECK (case when "adicionais_repasse"."tipo" = 'avulso'
        then "adicionais_repasse"."quantidade" is null and "adicionais_repasse"."valor_unitario_centavos" is null
        else "adicionais_repasse"."quantidade" >= 1 and "adicionais_repasse"."valor_unitario_centavos" > 0 end),
	CONSTRAINT "adicionais_repasse_referencia_check" CHECK (case when "adicionais_repasse"."tipo" = 'peer_review'
        then "adicionais_repasse"."referencia_desde" is not null and "adicionais_repasse"."referencia_ate" >= "adicionais_repasse"."referencia_desde"
        else "adicionais_repasse"."referencia_desde" is null and "adicionais_repasse"."referencia_ate" is null end),
	CONSTRAINT "adicionais_repasse_cancelamento_check" CHECK (("adicionais_repasse"."cancelado_em" is null) = ("adicionais_repasse"."motivo_cancelamento" is null))
);
--> statement-breakpoint
CREATE TABLE "alternativas_preco_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ordem" integer NOT NULL,
	"todas_especialidades" boolean NOT NULL,
	"especialidade_id" uuid,
	"sem_categoria" boolean NOT NULL,
	"categoria_origem_id" uuid,
	"categoria_destino_id" uuid NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "alternativas_preco_repasse_check" CHECK ("alternativas_preco_repasse"."todas_especialidades" = ("alternativas_preco_repasse"."especialidade_id" is null) and "alternativas_preco_repasse"."sem_categoria" = ("alternativas_preco_repasse"."categoria_origem_id" is null)),
	CONSTRAINT "alternativas_preco_repasse_vigencia_check" CHECK (("alternativas_preco_repasse"."vigencia_desde" is null or "alternativas_preco_repasse"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("alternativas_preco_repasse"."vigencia_ate" is null or "alternativas_preco_repasse"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("alternativas_preco_repasse"."vigencia_desde" is null or "alternativas_preco_repasse"."vigencia_ate" is null or "alternativas_preco_repasse"."vigencia_ate" >= "alternativas_preco_repasse"."vigencia_desde"))
);
--> statement-breakpoint
CREATE TABLE "configuracoes_medico_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"somente_adicionais" boolean NOT NULL,
	"todos_os_laudos" boolean NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "configuracoes_medico_repasse_vigencia_check" CHECK (("configuracoes_medico_repasse"."vigencia_desde" is null or "configuracoes_medico_repasse"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("configuracoes_medico_repasse"."vigencia_ate" is null or "configuracoes_medico_repasse"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("configuracoes_medico_repasse"."vigencia_desde" is null or "configuracoes_medico_repasse"."vigencia_ate" is null or "configuracoes_medico_repasse"."vigencia_ate" >= "configuracoes_medico_repasse"."vigencia_desde"))
);
--> statement-breakpoint
CREATE TABLE "configuracoes_medico_repasse_recortes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuracao_id" uuid NOT NULL,
	"todos_clientes" boolean NOT NULL,
	"cliente_id" uuid,
	"todas_especialidades" boolean NOT NULL,
	"especialidade_id" uuid,
	CONSTRAINT "configuracoes_medico_repasse_recortes_check" CHECK ("configuracoes_medico_repasse_recortes"."todos_clientes" = ("configuracoes_medico_repasse_recortes"."cliente_id" is null) and "configuracoes_medico_repasse_recortes"."todas_especialidades" = ("configuracoes_medico_repasse_recortes"."especialidade_id" is null))
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geracao_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"medico_id" uuid NOT NULL,
	"contratado_id" uuid,
	"volume" numeric(12, 2) NOT NULL,
	"exames_centavos" integer NOT NULL,
	"adicionais_centavos" integer NOT NULL,
	"bruto_centavos" integer NOT NULL,
	"retencoes_centavos" integer NOT NULL,
	"liquido_centavos" integer NOT NULL,
	"grupos_sem_preco" integer NOT NULL,
	CONSTRAINT "demonstrativos_repasse_geracao_medico_key" UNIQUE("geracao_id","medico_id")
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_repasse_dias" (
	"demonstrativo_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"volume" numeric(12, 2) NOT NULL,
	"total_centavos" integer NOT NULL,
	CONSTRAINT "demonstrativos_repasse_dias_demonstrativo_id_dia_pk" PRIMARY KEY("demonstrativo_id","dia")
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_repasse_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demonstrativo_id" uuid NOT NULL,
	"tipo" "tipo_item_repasse" NOT NULL,
	"modalidade_id" uuid,
	"especialidade_id" uuid,
	"categoria_id" uuid,
	"prioridade_id" uuid,
	"cliente_id" uuid,
	"unidade_id" uuid,
	"volume" numeric(12, 2),
	"unitario_centavos" integer,
	"total_centavos" integer NOT NULL,
	"origem_preco" "origem_preco_repasse",
	"categoria_preco_id" uuid,
	"preco_id" uuid,
	"adicional_id" uuid,
	"regra_id" uuid,
	"retencao_id" uuid,
	"descricao" text
);
--> statement-breakpoint
CREATE TABLE "demonstrativos_repasse_laudos" (
	"demonstrativo_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"laudo_id" uuid NOT NULL,
	"peca" integer NOT NULL,
	"volume" numeric(12, 2) NOT NULL,
	"total_centavos" integer NOT NULL,
	CONSTRAINT "demonstrativos_repasse_laudos_demonstrativo_id_laudo_id_peca_pk" PRIMARY KEY("demonstrativo_id","laudo_id","peca")
);
--> statement-breakpoint
CREATE TABLE "faixas_lista_atraso_padrao" (
	"parametros_id" uuid NOT NULL,
	"exames" integer NOT NULL,
	"valor_centavos" integer NOT NULL,
	CONSTRAINT "faixas_lista_atraso_padrao_parametros_id_exames_pk" PRIMARY KEY("parametros_id","exames"),
	CONSTRAINT "faixas_lista_atraso_padrao_check" CHECK ("faixas_lista_atraso_padrao"."exames" > 0 and "faixas_lista_atraso_padrao"."valor_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "geracoes_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia" text NOT NULL,
	"tipo" "tipo_geracao_repasse" NOT NULL,
	"atual" boolean NOT NULL,
	"recalculo_id" uuid,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"gerado_por_id" uuid,
	"medicos" integer NOT NULL,
	"bruto_centavos" integer NOT NULL,
	"liquido_centavos" integer NOT NULL,
	CONSTRAINT "geracoes_repasse_recalculo_check" CHECK (("geracoes_repasse"."tipo" = 'recalculo') = ("geracoes_repasse"."recalculo_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "parametros_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigencia_desde" text NOT NULL,
	"tarifa_peer_review_centavos" integer NOT NULL,
	"tarifa_plantao_centavos" integer NOT NULL,
	"contratado_registro_id" uuid,
	"paga_duplicados" boolean NOT NULL,
	"dia_vencimento" integer NOT NULL,
	"dia_corte_antecipacao" integer NOT NULL,
	"categoria_financeira_socio" text NOT NULL,
	"categoria_financeira_nao_socio" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "parametros_repasse_vigencia_desde_key" UNIQUE("vigencia_desde"),
	CONSTRAINT "parametros_repasse_vigencia_check" CHECK ("parametros_repasse"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "parametros_repasse_tarifas_check" CHECK ("parametros_repasse"."tarifa_peer_review_centavos" > 0 and "parametros_repasse"."tarifa_plantao_centavos" > 0),
	CONSTRAINT "parametros_repasse_dias_check" CHECK ("parametros_repasse"."dia_vencimento" between 1 and 28 and "parametros_repasse"."dia_corte_antecipacao" between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE "precos_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"modalidade_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	"todos_clientes" boolean NOT NULL,
	"cliente_id" uuid,
	"valor_centavos" integer NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "precos_repasse_cliente_check" CHECK ("precos_repasse"."todos_clientes" = ("precos_repasse"."cliente_id" is null)),
	CONSTRAINT "precos_repasse_valor_check" CHECK ("precos_repasse"."valor_centavos" >= 0),
	CONSTRAINT "precos_repasse_vigencia_check" CHECK (("precos_repasse"."vigencia_desde" is null or "precos_repasse"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("precos_repasse"."vigencia_ate" is null or "precos_repasse"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("precos_repasse"."vigencia_desde" is null or "precos_repasse"."vigencia_ate" is null or "precos_repasse"."vigencia_ate" >= "precos_repasse"."vigencia_desde"))
);
--> statement-breakpoint
CREATE TABLE "reclassificacoes_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"todas_modalidades" boolean NOT NULL,
	"todas_especialidades" boolean NOT NULL,
	"todas_categorias" boolean NOT NULL,
	"todos_medicos" boolean NOT NULL,
	"especialidade_destino_id" uuid,
	"categoria_destino_id" uuid,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "reclassificacoes_repasse_destino_check" CHECK ("reclassificacoes_repasse"."especialidade_destino_id" is not null or "reclassificacoes_repasse"."categoria_destino_id" is not null),
	CONSTRAINT "reclassificacoes_repasse_vigencia_check" CHECK (("reclassificacoes_repasse"."vigencia_desde" is null or "reclassificacoes_repasse"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("reclassificacoes_repasse"."vigencia_ate" is null or "reclassificacoes_repasse"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("reclassificacoes_repasse"."vigencia_desde" is null or "reclassificacoes_repasse"."vigencia_ate" is null or "reclassificacoes_repasse"."vigencia_ate" >= "reclassificacoes_repasse"."vigencia_desde"))
);
--> statement-breakpoint
CREATE TABLE "reclassificacoes_repasse_recortes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reclassificacao_id" uuid NOT NULL,
	"modalidade_id" uuid,
	"especialidade_id" uuid,
	"categoria_id" uuid,
	"equipe_id" uuid,
	CONSTRAINT "reclassificacoes_repasse_recortes_uma_dimensao_check" CHECK ((("reclassificacoes_repasse_recortes"."modalidade_id" is not null)::int + ("reclassificacoes_repasse_recortes"."especialidade_id" is not null)::int + ("reclassificacoes_repasse_recortes"."categoria_id" is not null)::int + ("reclassificacoes_repasse_recortes"."equipe_id" is not null)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE "regras_apuracao_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"tipo" "tipo_regra_apuracao" NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" integer,
	"percentual_ppm" integer,
	"divisor" integer DEFAULT 1 NOT NULL,
	"todas_modalidades" boolean NOT NULL,
	"todas_especialidades" boolean NOT NULL,
	"todas_prioridades" boolean NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "regras_apuracao_repasse_valor_check" CHECK (case when "regras_apuracao_repasse"."tipo" = 'percentual_repasse'
        then "regras_apuracao_repasse"."percentual_ppm" > 0 and "regras_apuracao_repasse"."valor_centavos" is null
        else "regras_apuracao_repasse"."valor_centavos" > 0 and "regras_apuracao_repasse"."percentual_ppm" is null end),
	CONSTRAINT "regras_apuracao_repasse_divisor_check" CHECK ("regras_apuracao_repasse"."divisor" >= 1),
	CONSTRAINT "regras_apuracao_repasse_vigencia_check" CHECK (("regras_apuracao_repasse"."vigencia_desde" is null or "regras_apuracao_repasse"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("regras_apuracao_repasse"."vigencia_ate" is null or "regras_apuracao_repasse"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("regras_apuracao_repasse"."vigencia_desde" is null or "regras_apuracao_repasse"."vigencia_ate" is null or "regras_apuracao_repasse"."vigencia_ate" >= "regras_apuracao_repasse"."vigencia_desde"))
);
--> statement-breakpoint
CREATE TABLE "regras_apuracao_repasse_recortes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regra_id" uuid NOT NULL,
	"modalidade_id" uuid,
	"especialidade_id" uuid,
	"prioridade_id" uuid,
	CONSTRAINT "regras_apuracao_repasse_recortes_uma_dimensao_check" CHECK ((("regras_apuracao_repasse_recortes"."modalidade_id" is not null)::int + ("regras_apuracao_repasse_recortes"."especialidade_id" is not null)::int + ("regras_apuracao_repasse_recortes"."prioridade_id" is not null)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE "retencoes_repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descricao" text NOT NULL,
	"aplica_a" "aplicacao_retencao" NOT NULL,
	"aliquota_ppm" integer NOT NULL,
	"piso_centavos" integer DEFAULT 0 NOT NULL,
	"vigencia_desde" text,
	"vigencia_ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por_id" uuid,
	CONSTRAINT "retencoes_repasse_valores_check" CHECK ("retencoes_repasse"."aliquota_ppm" > 0 and "retencoes_repasse"."aliquota_ppm" <= 1000000 and "retencoes_repasse"."piso_centavos" >= 0),
	CONSTRAINT "retencoes_repasse_vigencia_check" CHECK (("retencoes_repasse"."vigencia_desde" is null or "retencoes_repasse"."vigencia_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("retencoes_repasse"."vigencia_ate" is null or "retencoes_repasse"."vigencia_ate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and ("retencoes_repasse"."vigencia_desde" is null or "retencoes_repasse"."vigencia_ate" is null or "retencoes_repasse"."vigencia_ate" >= "retencoes_repasse"."vigencia_desde"))
);
--> statement-breakpoint
ALTER TABLE "adicionais_repasse" ADD CONSTRAINT "adicionais_repasse_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adicionais_repasse" ADD CONSTRAINT "adicionais_repasse_recalculo_id_recalculos_competencia_id_fk" FOREIGN KEY ("recalculo_id") REFERENCES "public"."recalculos_competencia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adicionais_repasse" ADD CONSTRAINT "adicionais_repasse_lancado_por_id_usuarios_id_fk" FOREIGN KEY ("lancado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adicionais_repasse" ADD CONSTRAINT "adicionais_repasse_cancelado_por_id_usuarios_id_fk" FOREIGN KEY ("cancelado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alternativas_preco_repasse" ADD CONSTRAINT "alternativas_preco_repasse_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alternativas_preco_repasse" ADD CONSTRAINT "alternativas_preco_repasse_categoria_origem_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_origem_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alternativas_preco_repasse" ADD CONSTRAINT "alternativas_preco_repasse_categoria_destino_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_destino_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alternativas_preco_repasse" ADD CONSTRAINT "alternativas_preco_repasse_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_medico_repasse" ADD CONSTRAINT "configuracoes_medico_repasse_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_medico_repasse" ADD CONSTRAINT "configuracoes_medico_repasse_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_medico_repasse_recortes" ADD CONSTRAINT "configuracoes_medico_repasse_recortes_configuracao_id_configuracoes_medico_repasse_id_fk" FOREIGN KEY ("configuracao_id") REFERENCES "public"."configuracoes_medico_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_medico_repasse_recortes" ADD CONSTRAINT "configuracoes_medico_repasse_recortes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_medico_repasse_recortes" ADD CONSTRAINT "configuracoes_medico_repasse_recortes_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse" ADD CONSTRAINT "demonstrativos_repasse_geracao_id_geracoes_repasse_id_fk" FOREIGN KEY ("geracao_id") REFERENCES "public"."geracoes_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse" ADD CONSTRAINT "demonstrativos_repasse_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse" ADD CONSTRAINT "demonstrativos_repasse_contratado_id_contratados_id_fk" FOREIGN KEY ("contratado_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_dias" ADD CONSTRAINT "demonstrativos_repasse_dias_demonstrativo_id_demonstrativos_repasse_id_fk" FOREIGN KEY ("demonstrativo_id") REFERENCES "public"."demonstrativos_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_demonstrativo_id_demonstrativos_repasse_id_fk" FOREIGN KEY ("demonstrativo_id") REFERENCES "public"."demonstrativos_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_unidade_id_clientes_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_categoria_preco_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_preco_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_preco_id_precos_repasse_id_fk" FOREIGN KEY ("preco_id") REFERENCES "public"."precos_repasse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_adicional_id_adicionais_repasse_id_fk" FOREIGN KEY ("adicional_id") REFERENCES "public"."adicionais_repasse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_regra_id_regras_apuracao_repasse_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_apuracao_repasse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_itens" ADD CONSTRAINT "demonstrativos_repasse_itens_retencao_id_retencoes_repasse_id_fk" FOREIGN KEY ("retencao_id") REFERENCES "public"."retencoes_repasse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_laudos" ADD CONSTRAINT "demonstrativos_repasse_laudos_demonstrativo_id_demonstrativos_repasse_id_fk" FOREIGN KEY ("demonstrativo_id") REFERENCES "public"."demonstrativos_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_laudos" ADD CONSTRAINT "demonstrativos_repasse_laudos_item_id_demonstrativos_repasse_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."demonstrativos_repasse_itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demonstrativos_repasse_laudos" ADD CONSTRAINT "demonstrativos_repasse_laudos_laudo_id_laudos_id_fk" FOREIGN KEY ("laudo_id") REFERENCES "public"."laudos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixas_lista_atraso_padrao" ADD CONSTRAINT "faixas_lista_atraso_padrao_parametros_id_parametros_repasse_id_fk" FOREIGN KEY ("parametros_id") REFERENCES "public"."parametros_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geracoes_repasse" ADD CONSTRAINT "geracoes_repasse_recalculo_id_recalculos_competencia_id_fk" FOREIGN KEY ("recalculo_id") REFERENCES "public"."recalculos_competencia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geracoes_repasse" ADD CONSTRAINT "geracoes_repasse_gerado_por_id_usuarios_id_fk" FOREIGN KEY ("gerado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_repasse" ADD CONSTRAINT "parametros_repasse_contratado_registro_id_contratados_id_fk" FOREIGN KEY ("contratado_registro_id") REFERENCES "public"."contratados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_repasse" ADD CONSTRAINT "parametros_repasse_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_repasse" ADD CONSTRAINT "precos_repasse_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_repasse" ADD CONSTRAINT "precos_repasse_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_repasse" ADD CONSTRAINT "precos_repasse_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_repasse" ADD CONSTRAINT "precos_repasse_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_repasse" ADD CONSTRAINT "precos_repasse_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_repasse" ADD CONSTRAINT "precos_repasse_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_repasse" ADD CONSTRAINT "precos_repasse_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse" ADD CONSTRAINT "reclassificacoes_repasse_especialidade_destino_id_especialidades_id_fk" FOREIGN KEY ("especialidade_destino_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse" ADD CONSTRAINT "reclassificacoes_repasse_categoria_destino_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_destino_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse" ADD CONSTRAINT "reclassificacoes_repasse_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse_recortes" ADD CONSTRAINT "reclassificacoes_repasse_recortes_reclassificacao_id_reclassificacoes_repasse_id_fk" FOREIGN KEY ("reclassificacao_id") REFERENCES "public"."reclassificacoes_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse_recortes" ADD CONSTRAINT "reclassificacoes_repasse_recortes_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse_recortes" ADD CONSTRAINT "reclassificacoes_repasse_recortes_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse_recortes" ADD CONSTRAINT "reclassificacoes_repasse_recortes_categoria_id_categorias_exame_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_exame"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassificacoes_repasse_recortes" ADD CONSTRAINT "reclassificacoes_repasse_recortes_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apuracao_repasse" ADD CONSTRAINT "regras_apuracao_repasse_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apuracao_repasse" ADD CONSTRAINT "regras_apuracao_repasse_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apuracao_repasse_recortes" ADD CONSTRAINT "regras_apuracao_repasse_recortes_regra_id_regras_apuracao_repasse_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_apuracao_repasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apuracao_repasse_recortes" ADD CONSTRAINT "regras_apuracao_repasse_recortes_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apuracao_repasse_recortes" ADD CONSTRAINT "regras_apuracao_repasse_recortes_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apuracao_repasse_recortes" ADD CONSTRAINT "regras_apuracao_repasse_recortes_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retencoes_repasse" ADD CONSTRAINT "retencoes_repasse_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adicionais_repasse_competencia_idx" ON "adicionais_repasse" USING btree ("competencia","medico_id");--> statement-breakpoint
CREATE INDEX "configuracoes_medico_repasse_medico_idx" ON "configuracoes_medico_repasse" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "configuracoes_medico_repasse_recortes_configuracao_idx" ON "configuracoes_medico_repasse_recortes" USING btree ("configuracao_id");--> statement-breakpoint
CREATE INDEX "demonstrativos_repasse_medico_idx" ON "demonstrativos_repasse" USING btree ("medico_id","competencia");--> statement-breakpoint
CREATE INDEX "demonstrativos_repasse_itens_demonstrativo_idx" ON "demonstrativos_repasse_itens" USING btree ("demonstrativo_id");--> statement-breakpoint
CREATE INDEX "demonstrativos_repasse_laudos_laudo_idx" ON "demonstrativos_repasse_laudos" USING btree ("laudo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geracoes_repasse_atual_key" ON "geracoes_repasse" USING btree ("competencia") WHERE "geracoes_repasse"."atual";--> statement-breakpoint
CREATE INDEX "geracoes_repasse_competencia_idx" ON "geracoes_repasse" USING btree ("competencia","gerado_em");--> statement-breakpoint
CREATE INDEX "precos_repasse_medico_idx" ON "precos_repasse" USING btree ("medico_id","modalidade_id","especialidade_id");--> statement-breakpoint
CREATE INDEX "reclassificacoes_repasse_recortes_regra_idx" ON "reclassificacoes_repasse_recortes" USING btree ("reclassificacao_id");--> statement-breakpoint
CREATE INDEX "regras_apuracao_repasse_medico_idx" ON "regras_apuracao_repasse" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "regras_apuracao_repasse_recortes_regra_idx" ON "regras_apuracao_repasse_recortes" USING btree ("regra_id");