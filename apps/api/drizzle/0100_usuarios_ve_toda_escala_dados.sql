-- Custom SQL migration file, put your code below! --
-- "Vê toda a escala" explícito (25/11/2026): quem não tinha linha em usuarios_escopos_escala, e
-- por isso via a escala toda, ganha ve_toda_escala = true. O que cada usuária vê não muda.
UPDATE "usuarios" u SET "ve_toda_escala" = true
WHERE NOT EXISTS (SELECT 1 FROM "usuarios_escopos_escala" e WHERE e."usuario_id" = u."id");
