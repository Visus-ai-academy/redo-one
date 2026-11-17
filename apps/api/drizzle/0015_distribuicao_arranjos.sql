CREATE TYPE "public"."modo_vinculo" AS ENUM('todos', 'apenas', 'exceto');--> statement-breakpoint
CREATE TABLE "arranjos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid,
	"equipe_id" uuid,
	"especialidade_id" uuid,
	"subespecialidade_geral" boolean DEFAULT false NOT NULL,
	"modo_clientes" "modo_vinculo" DEFAULT 'todos' NOT NULL,
	"modo_exames" "modo_vinculo" DEFAULT 'todos' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arranjos_dono_check" CHECK (("arranjos"."medico_id" is null) <> ("arranjos"."equipe_id" is null))
);
--> statement-breakpoint
CREATE TABLE "arranjos_clientes" (
	"arranjo_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	CONSTRAINT "arranjos_clientes_arranjo_id_cliente_id_pk" PRIMARY KEY("arranjo_id","cliente_id")
);
--> statement-breakpoint
CREATE TABLE "arranjos_clientes_exclusivos" (
	"arranjo_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	CONSTRAINT "arranjos_clientes_exclusivos_arranjo_id_cliente_id_pk" PRIMARY KEY("arranjo_id","cliente_id")
);
--> statement-breakpoint
CREATE TABLE "arranjos_exames" (
	"arranjo_id" uuid NOT NULL,
	"exame_id" uuid NOT NULL,
	CONSTRAINT "arranjos_exames_arranjo_id_exame_id_pk" PRIMARY KEY("arranjo_id","exame_id")
);
--> statement-breakpoint
CREATE TABLE "arranjos_modalidades" (
	"arranjo_id" uuid NOT NULL,
	"modalidade_id" uuid NOT NULL,
	CONSTRAINT "arranjos_modalidades_arranjo_id_modalidade_id_pk" PRIMARY KEY("arranjo_id","modalidade_id")
);
--> statement-breakpoint
CREATE TABLE "arranjos_prioridades" (
	"arranjo_id" uuid NOT NULL,
	"prioridade_id" uuid NOT NULL,
	CONSTRAINT "arranjos_prioridades_arranjo_id_prioridade_id_pk" PRIMARY KEY("arranjo_id","prioridade_id")
);
--> statement-breakpoint
CREATE TABLE "arranjos_subespecialidades" (
	"arranjo_id" uuid NOT NULL,
	"subespecialidade_id" uuid NOT NULL,
	CONSTRAINT "arranjos_subespecialidades_arranjo_id_subespecialidade_id_pk" PRIMARY KEY("arranjo_id","subespecialidade_id")
);
--> statement-breakpoint
CREATE TABLE "medicos_distribuicao" (
	"medico_id" uuid PRIMARY KEY NOT NULL,
	"habilitado_robo" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arranjos" ADD CONSTRAINT "arranjos_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos" ADD CONSTRAINT "arranjos_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos" ADD CONSTRAINT "arranjos_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_clientes" ADD CONSTRAINT "arranjos_clientes_arranjo_id_arranjos_id_fk" FOREIGN KEY ("arranjo_id") REFERENCES "public"."arranjos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_clientes" ADD CONSTRAINT "arranjos_clientes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_clientes_exclusivos" ADD CONSTRAINT "arranjos_clientes_exclusivos_arranjo_id_arranjos_id_fk" FOREIGN KEY ("arranjo_id") REFERENCES "public"."arranjos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_clientes_exclusivos" ADD CONSTRAINT "arranjos_clientes_exclusivos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_exames" ADD CONSTRAINT "arranjos_exames_arranjo_id_arranjos_id_fk" FOREIGN KEY ("arranjo_id") REFERENCES "public"."arranjos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_exames" ADD CONSTRAINT "arranjos_exames_exame_id_exames_id_fk" FOREIGN KEY ("exame_id") REFERENCES "public"."exames"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_modalidades" ADD CONSTRAINT "arranjos_modalidades_arranjo_id_arranjos_id_fk" FOREIGN KEY ("arranjo_id") REFERENCES "public"."arranjos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_modalidades" ADD CONSTRAINT "arranjos_modalidades_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_prioridades" ADD CONSTRAINT "arranjos_prioridades_arranjo_id_arranjos_id_fk" FOREIGN KEY ("arranjo_id") REFERENCES "public"."arranjos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_prioridades" ADD CONSTRAINT "arranjos_prioridades_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_subespecialidades" ADD CONSTRAINT "arranjos_subespecialidades_arranjo_id_arranjos_id_fk" FOREIGN KEY ("arranjo_id") REFERENCES "public"."arranjos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_subespecialidades" ADD CONSTRAINT "arranjos_subespecialidades_subespecialidade_id_subespecialidades_id_fk" FOREIGN KEY ("subespecialidade_id") REFERENCES "public"."subespecialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicos_distribuicao" ADD CONSTRAINT "medicos_distribuicao_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arranjos_medico_idx" ON "arranjos" USING btree ("medico_id");--> statement-breakpoint
CREATE INDEX "arranjos_equipe_idx" ON "arranjos" USING btree ("equipe_id");--> statement-breakpoint
CREATE INDEX "arranjos_clientes_exclusivos_cliente_idx" ON "arranjos_clientes_exclusivos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "medicos_distribuicao_habilitado_idx" ON "medicos_distribuicao" USING btree ("habilitado_robo");