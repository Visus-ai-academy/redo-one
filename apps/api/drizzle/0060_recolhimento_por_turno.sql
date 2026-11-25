CREATE TABLE "configuracao_distribuicao_recolhimento_turnos" (
	"turno_id" uuid PRIMARY KEY NOT NULL,
	"minutos" integer NOT NULL,
	CONSTRAINT "configuracao_distribuicao_recolhimento_turnos_minutos_check" CHECK ("configuracao_distribuicao_recolhimento_turnos"."minutos" between 0 and 10080)
);
--> statement-breakpoint
ALTER TABLE "configuracao_distribuicao_recolhimento_turnos" ADD CONSTRAINT "configuracao_distribuicao_recolhimento_turnos_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;