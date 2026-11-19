CREATE TABLE "usuarios_papeis" (
	"usuario_id" uuid NOT NULL,
	"papel_id" uuid NOT NULL,
	CONSTRAINT "usuarios_papeis_usuario_id_papel_id_pk" PRIMARY KEY("usuario_id","papel_id")
);
--> statement-breakpoint
ALTER TABLE "usuarios_papeis" ADD CONSTRAINT "usuarios_papeis_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_papeis" ADD CONSTRAINT "usuarios_papeis_papel_id_papeis_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papeis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usuarios_papeis_papel_id_idx" ON "usuarios_papeis" USING btree ("papel_id");