---
title: "Distribuição: rodada só manual por enquanto, fila e execução por portas fake, paciente só por id e HMAC"
keywords: ["distribuição", "rodada", "round", "MobileMed", "porta", "port", "adaptador fake", "LGPD", "paciente", "HMAC", "rodada automática", "recolhimento", "ausência"]
module: "distribuicao"
commit: "0c5edefd923f515c70bd192573cfbac51e081f94"
dirty: true
provenance: "agent"
created_at: "2026-11-17T18:23:30.528Z"
---

Decidido com o usuário em 17/11/2026. Sem rodadas automáticas por ora (no dashboards-one eram 1.130 automáticas contra 421 manuais em 30 dias, com a agenda fixa no código); a ideia anotada no TODO é uma agenda configurável por tela, com aprovação automática por item, desligada por padrão. Até o mapeamento da API da MobileMed, a leitura da fila e a atribuição ficam atrás das portas FilaExames e AtribuidorExames com adaptadores fake: fila sintética (exames e clientes reais, pacientes fictícios) e execução que só registra; nada chega a médico. A designação guarda o id do exame na MobileMed e o HMAC do paciente (para agrupar o pacote), nunca o nome; o nome aparece na conferência só a quem tem permissão. Ausência aprovada no dia recolhe todo exame NOVO do médico (regra do legado confirmada). Crédito pré-pago e peso da qualidade entram com os contextos deles (Fases 5 e 6), nem como porta vazia agora. Em aberto: quais prioridades da MobileMed contam como urgência (o legado inclui INTERNADO, que no catálogo é variação de ROTINA).
