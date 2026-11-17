---
title: "Selects de frente agrupados em especialidades e modalidades, com cor; subespecialidades só da frente"
keywords: ["frente","select","grupo","especialidades","modalidades","cor","subespecialidades","alocação"]
module: "escala"
anchors: ["apps/web/src/components/escala/opcoes-frentes.ts","apps/web/src/components/select/grupos.ts","apps/web/src/components/escala/PainelAlocacao.tsx"]
commit: "40e1f59cf5c1819b98aade27fea5de6ddba182e7"
dirty: false
provenance: "agent"
created_at: "2026-11-17T14:30:45.000Z"
---

Pedidos do usuário em 17/11/2026.

- Todo select de frente separa "Especialidades" e "Modalidades" em subtítulos (sem divisória); frente sem tipo (inativa vinda de plantão antigo) fica no fim sem subtítulo. O kit (Select, SelecaoMultiplaField, CheckboxListField, FiltroMultiplo) aceita `grupo` e `cor`.
- Frentes, turnos e tipos de ausência mostram a bolinha da cor (`BolinhaCor`) em filtros, selects e listas; o filtro de frentes da escala ocupa a altura que precisa (só o select com busca mantém o teto).
- Na alocação, a lista de subespecialidades só aparece com frente de especialidade que tem subespecialidades e só com as dela; trocar a frente desmarca as que não são dela.
