---
title: "Ingestão de laudos: chave natural, reconciliação da janela e volume"
keywords: ["ingestao","importação","laudos","chave natural","identidade","upsert","reconciliação","trava","volume","competência","totais pré-somados"]
module: "ingestao"
anchors:
  - "apps/api/src/ingestao/domain/identidade-laudo.ts"
  - "apps/api/src/ingestao/domain/planejar-importacao.ts"
  - "apps/api/src/ingestao/domain/classificar-estudo.ts"
  - "apps/api/src/ingestao/application/use-cases/importar-laudos.ts"
  - "apps/api/src/ingestao/infrastructure/persistence/drizzle-laudos.repository.ts"
  - "apps/api/src/database/schema/ingestao.ts"
commit: "ff1c7b2a2f6b354b264311224675e342035924b6"
dirty: false
provenance: "agent"
created_at: "2026-11-16T15:30:00.000Z"
---

Recomendações aprovadas pelo usuário em 16/11/2026 (plano da Fase 3).

- **Chave natural** (`laudos.identidade`, sha256): empresa como chega + accession (vazio vale) + HMAC do código do paciente + estudo + realização (data e hora) + data do laudo. A planilha da MobileMed não tem id estável; ~12% dos laudos vêm sem accession e há accessions genéricos ("UTI", "P.S", "RMA"). Empresa + accession + dia + estudo colidia em metade dos laudos sem accession; a chave escolhida é única em 251 mil laudos (05–11/2026) e nos 40.374 de outubro. A data do laudo separa o mesmo exame laudado duas vezes, que o dashboards-one conta como dois. Usa o nome da empresa, não o cliente resolvido, para apelido e unificação não mudarem a identidade.
- **Reconciliação da janela**: o robô reenvia o mês atual e o anterior inteiros; upsert puro nunca tiraria o laudo cancelado ou com estudo renomeado. Na janela de dias do laudo do arquivo (por origem; no compartilhamento, só as empresas do arquivo), o que não veio ganha `removido_em` (não se apaga). Trava contra arquivo truncado em `parametros_ingestao` (padrão do legado: > 500 e > 2× as linhas), editável em Configurações › Importação de laudos.
- **Volume** = VALORES > 0, senão o valor fora do padrão (ativo, > 0), senão 1, como os painéis do legado; a quebra não muda o volume e as peças ficam em `laudos_pecas_quebra` para o faturamento.
- **Especialidade**: a do exame do cadastro (ou do vinculado ao valor fora do padrão) sempre que existir, como o faturamento do legado; sem ele, a que chega, ignorando modalidade e "não é especialidade".
- **Totais** (`totais_laudos_dia`): dia do laudo (Brasília) × cliente × modalidade × especialidade × prioridade × médico × status, refeitos por dia da janela na mesma transação. A tipificação entra quando o `faturamento` existir.
- **Competência fechada**: porta `CompetenciasBloqueadas`, que responde "nenhuma" até a tabela de competências do `faturamento`.
- **Tabelas de operação**: fila e retratos na `ingestao`; painéis de SLA e prazos no `analytics`; pilha do robô e carência na `distribuicao`; metas a decidir.
- Uma importação por vez (fila `ingestao` do graphile-worker). Conferido com outubro/2026 do dashboards-one: mesmas linhas, volume (45.697) igual por empresa, todos os clientes resolvidos, os mesmos 22 médicos sem cadastro.
