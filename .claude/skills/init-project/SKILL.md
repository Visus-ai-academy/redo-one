---
name: init-project
description: Setup inicial de um projeto criado a partir deste template. Entrevista o usuário sobre o domínio e valida as decisões do projeto (escala, arquitetura do backend, multi-tenancy, auth, jobs, tempo real, cache, arquivos, observabilidade, deploy, LGPD, SEO, PWA), recomenda a opção mais simples que atende em cada uma, registra as decisões e ajusta os nomes do template. Use quando o usuário rodar /init-project ou pedir para configurar/iniciar um projeto novo a partir do template.
disable-model-invocation: true
---

# Setup de um projeto novo

Roda **uma vez**, logo depois de criar o repositório a partir do template. Faça as etapas em ordem. Não altere nada antes da etapa 5 (confirmação).

Princípio em todas as decisões: **a opção mais simples que atende hoje**, com o gatilho que faria mudar registrado. A empresa é pequena: complexidade sem necessidade custa mais do que ajuda. Explique cada termo em linguagem simples; o usuário pode não conhecê-lo.

## 1. Contexto

Pergunte (agrupe as perguntas; use a ferramenta de perguntas quando houver opções fechadas):

1. **Nome do projeto** (kebab-case, ex.: `gestao-frotas`).
2. **O que o sistema faz**, em 2 a 4 frases, e quem usa.
3. **Quais apps são necessários**: API + web (padrão), só API ou só web.

## 2. Decisões do projeto

Leia `dimensions.md` (nesta pasta). Informe as decisões fixas pela stack e valide as demais, nesta ordem:

1. **Escala e desempenho** primeiro: ela calibra as recomendações seguintes.
2. **Arquitetura do backend** (tabela abaixo).
3. As demais dimensões de `dimensions.md` (multi-tenancy, auth e permissões, jobs, tempo real, cache, arquivos, observabilidade, deploy, LGPD e auditoria, SEO, PWA).

Agrupe 3 ou 4 dimensões por rodada de perguntas. Quando a resposta for vaga, peça um exemplo concreto do domínio antes de decidir. Para cada dimensão, apresente: a recomendação, o motivo (ligado às respostas), o que custa, e o gatilho para revisar.

### Arquitetura do backend

| Nível | Quando usar | Sinais típicos | Skill |
| ----- | ----------- | -------------- | ----- |
| `modular` (padrão) | CRUD, regras simples e locais, MVP, painel interno | Poucas regras além de cadastro e consulta | `nest-module` |
| `modular-ddd` | Regras de negócio ricas, mas poucas integrações e infra estável | Estados com transições, invariantes, vocabulário próprio do negócio | `nest-module` (variante DDD tático) |
| `hexagonal` (inclui Clean) | Domínio rico **e** várias integrações ou infra trocável; vida longa | Pagamentos, filas, ERPs, APIs de terceiros, provedores que podem mudar | `hexagonal-architecture` |

Esclareça para o usuário:

- **DDD não é uma estrutura de pastas.** O **DDD estratégico** (dividir o sistema em contextos com linguagem própria, ex.: "catálogo", "pedidos", "faturamento") vale em qualquer nível: cada contexto vira um módulo Nest. O **DDD tático** (entidades, value objects, agregados) é o que diferencia `modular-ddd`.
- **Clean e Hexagonal** resolvem o mesmo problema; no template são um nível só (`hexagonal`).
- O nível pode subir depois, **módulo por módulo**, quando a complexidade aparecer.

## 3. Glossário (se `modular-ddd` ou `hexagonal`)

Com o usuário, liste de 5 a 15 termos do domínio com definição de uma linha e o nome no código (ex.: `Apólice` → `Policy`). Classes, tabelas e rotas seguem esse glossário.

## 4. Resumo

Mostre uma tabela `Dimensão | Decisão | Por quê | Revisar se` com todas as decisões (fixas e validadas) e a lista do que será alterado na etapa 6.

## 5. Confirmar

Espere a confirmação explícita do usuário. Ajuste o que ele pedir e mostre o resumo de novo.

## 6. Aplicar

1. **Nomes do template** → nome do projeto:
   - `package.json` da raiz (`name`), `apps/api/docker-compose.yml` (`name`, isola os volumes do banco), `apps/web/src/routes/__root.tsx` (`title`), `apps/api/src/openapi/openapi.ts` (`setTitle`, depois `pnpm generate`), `README.md` (título e descrição).
2. **`CLAUDE.md` da raiz**, logo após o primeiro parágrafo:
   - `## Projeto`: o que o sistema faz, quem usa, contextos/módulos principais e o glossário (`Termo | Definição | Nome no código`), se houver.
   - `## Decisões do projeto`: a tabela da etapa 4. Acrescente uma linha: "Decisões mudam por pedido explícito; ao mudar, atualize esta tabela."
3. **`apps/api/CLAUDE.md`**, seção "Arquitetura": troque a linha para `**Arquitetura deste projeto: <nível>.**` e adicione `**Por quê:**` e `**Revisar se:**`.
4. **Regras que valem desde o primeiro módulo**, no `CLAUDE.md` do app correspondente (curtas, só das decisões tomadas):
   - Multi-tenancy com `tenant_id`: toda tabela de negócio tem `tenant_id` e toda query filtra por ele, com teste de isolamento.
   - Auth: tipo de login, sessão e modelo de permissões; onde a checagem acontece.
   - LGPD: campos pessoais comentados no schema, proibição de dados pessoais em logs, exportação/exclusão, auditoria (se decidida).
   - Escala `moderada`/`alta`: paginação obrigatória, índices junto com cada tabela, nada pesado dentro da requisição.
5. **SEO**: se for só sistema logado, adicione `noindex` no `head` do `__root.tsx` e um `apps/web/public/robots.txt` bloqueando tudo. Se houver páginas públicas, registre a regra (meta tags por rota, sitemap) no `apps/web/CLAUDE.md`; a implementação vem com a primeira página pública.
6. **PWA**: só registre a decisão e o nível (`instalável`, `offline`, `push`) no `apps/web/CLAUDE.md`; a implementação vem depois, pela skill `add-dependency`.
7. **Apps não usados**: confirme de novo e só então remova a pasta e as referências (`README.md`, `CLAUDE.md`, `biome.json`, `turbo.json`). Rode `pnpm install`.
8. Rode `pnpm install`, `pnpm check`, `pnpm typecheck`, `pnpm test` e `pnpm build`, e reporte o resultado real.

**Não instale dependências nem implemente infraestrutura** (auth, filas, cache, storage, observabilidade) nesta skill. As decisões ficam registradas; cada uma é implementada quando o primeiro módulo precisar, com TDD e a skill `add-dependency`.

## 7. Próximos passos para o usuário

- Copiar `apps/api/.env.example` e `apps/web/.env.example` para `.env` e preencher; subir o banco (`docker compose -f apps/api/docker-compose.yml up -d`) e rodar `pnpm --filter @repo/api db:migrate`.
- Instalar o `typescript-language-server` e aceitar a instalação dos plugins do Claude Code.
- Revisar `pnpm approve` (skills que vêm nos pacotes).
- Fazer o primeiro commit e configurar no GitHub a proteção da branch `main` (PR + CI obrigatório).
- Para decisões que dependem de serviço pago ou conta externa (provedor de login, monitoramento, storage), escolher o provedor quando chegar a hora.
