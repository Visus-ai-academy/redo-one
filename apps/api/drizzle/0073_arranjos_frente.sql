CREATE TABLE "arranjos_especialidades" (
	"arranjo_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	CONSTRAINT "arranjos_especialidades_arranjo_id_especialidade_id_pk" PRIMARY KEY("arranjo_id","especialidade_id")
);
--> statement-breakpoint
ALTER TABLE "arranjos" ADD COLUMN "modalidade_id" uuid;--> statement-breakpoint
ALTER TABLE "arranjos_especialidades" ADD CONSTRAINT "arranjos_especialidades_arranjo_id_arranjos_id_fk" FOREIGN KEY ("arranjo_id") REFERENCES "public"."arranjos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos_especialidades" ADD CONSTRAINT "arranjos_especialidades_especialidade_id_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arranjos" ADD CONSTRAINT "arranjos_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;