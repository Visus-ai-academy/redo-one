-- Usuário com vários papéis (só dados): cada um fica com o papel que já tinha. Idempotente.
insert into "usuarios_papeis" ("usuario_id", "papel_id")
select "id", "papel_id" from "usuarios"
on conflict do nothing;
