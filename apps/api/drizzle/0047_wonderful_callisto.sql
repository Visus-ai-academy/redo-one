CREATE TABLE "laudos_pacientes" (
	"laudo_id" uuid PRIMARY KEY NOT NULL,
	"nome" text,
	"codigo" text,
	"conferencia" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "laudos_pacientes" ADD CONSTRAINT "laudos_pacientes_laudo_id_laudos_id_fk" FOREIGN KEY ("laudo_id") REFERENCES "public"."laudos"("id") ON DELETE cascade ON UPDATE no action;