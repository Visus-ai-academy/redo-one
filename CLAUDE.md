# CLAUDE.md

Monorepo TypeScript com pnpm workspaces e Turborepo. Visão geral, setup e convenções no `README.md`.

## Projeto

**One** é a plataforma interna da TeleImagem (telerradiologia: laudos a distância de exames de imagem para clínicas e hospitais). Reescrita do `dashboards-one` (Next.js + Prisma), que tinha problemas de organização, desempenho, permissões e telas redundantes.

- **O que faz:** recebe os laudos da MobileMed (via RPA), distribui exames aos médicos conforme a escala, mede SLA e qualidade, fatura os clientes (Omie), calcula o repasse dos médicos, controla o crédito dos clientes pré-pagos, gere contratos (ClickSign) e mostra painéis de volumetria e gestão.
- **Quem usa:** equipe interna (~20–50 pessoas: diretoria, coordenadores de especialidade, financeiro, operação, gestão de escala, CS/comercial); médicos (~250) pelo portal; robôs (RPA de importação, distribuição e comentários) como contas de serviço.
- **Volume:** ~40 mil laudos/mês (~1,3 mil/dia, picos de 2–3 mil), ~1 milhão no histórico, fila pendente de ~2 mil exames, ~200 clientes.

### Contextos (módulos da API)

| Contexto | Módulo | Responsabilidade |
| --- | --- | --- |
| Ingestão de laudos | `ingestao` | Importar laudos e retrato da fila, deduplicar, calcular competência e volume |
| Faturamento | `faturamento` | Tipificação, preço, franquia, impostos, demonstrativo do cliente, fechamento da competência |
| Repasse médico | `repasse` | Demonstrativo do médico, adicionais, regras de apuração, Altis |
| Crédito pré-pago | `credito-pre-pago` | Saldo, reserva, recarga e alertas dos clientes pré-pagos |
| Contratos | `contratos` | Contratos, documentos e assinatura |
| Distribuição | `distribuicao` | Rodadas do robô e motor de atribuição de exames |
| Escala médica | `escala` | Turnos, alocações, ausências e coberturas |
| Qualidade | `qualidade` | Chamados, classificação do médico, RadShield |
| Analytics | `analytics` | Volumetria, painéis, análise preditiva (só leitura de agregados) |
| Cadastros e catálogo | `catalogo` | Exames, modalidades, especialidades, de-paras e apelidos de cliente |
| Médicos | `medicos` | Cadastro do médico (dados, CRM, especialidades, nomes na MobileMed), usado pelos outros contextos |
| Identidade e acesso | `identidade` | Usuários, papéis, permissões, sessões e chaves dos robôs |

Competência e fechamento são conceitos compartilhados entre ingestão, faturamento, repasse e pré-pago. O portal do médico é UI sobre repasse, escala e qualidade, não um contexto.

### Glossário

Nomes do domínio em português, sem acento; termos técnicos do framework em inglês (`LaudoController`, `CompetenciaRepository`).

| Termo | Definição | Nome no código |
| --- | --- | --- |
| Laudo | Exame laudado e assinado, vindo da MobileMed | `Laudo` |
| Exame | Item do catálogo que se lauda | `Exame` |
| Volume | Quantas unidades um laudo vale (sempre soma, nunca contagem de linhas) | `volume` |
| Arranjo | Modalidade + especialidade + categoria + prioridade; unidade de preço | `Arranjo` |
| Competência | Mês de faturamento: maior entre o mês da realização e o mês de (laudo − 7 dias), em horário de Brasília | `Competencia` |
| Cliente | Clínica ou hospital que contrata os laudos | `Cliente` |
| Contratado | Empresa própria que emite a nota (001 Teleimagem, 002 Radiologia Nacional) | `Contratado` |
| Tipificação | Classificação (CO/NC/NC1 + sub-regra) que decide se o laudo fatura | `Tipificacao` |
| Franquia | Taxa mensal cobrada além dos exames, conforme volume, com carência; pode ser trocada pela cobrança do excedente | `Franquia` |
| Demonstrativo de faturamento | Foto fechada do que se cobra de um cliente na competência | `DemonstrativoFaturamento` |
| Demonstrativo de repasse | Foto fechada do que se paga a um médico na competência | `DemonstrativoRepasse` |
| Adicional | Crédito ou débito avulso no repasse | `Adicional` |
| Rodada | Ciclo do robô de distribuição: ler → propor → aprovar → executar | `Rodada` |
| Retrato da fila | Foto da fila de exames pendentes na MobileMed | `RetratoFila` |
| Turno / Alocação / Ausência | Bloco da escala / médico escalado no turno / afastamento com cobertura | `Turno` / `Alocacao` / `Ausencia` |
| Movimento de crédito / Recarga | Lançamento no extrato do pré-pago / pedido de boleto para recarregar | `MovimentoCredito` / `Recarga` |
| Aviso | Pendência de cadastro encontrada na importação, com triagem | `Aviso` |

## Decisões do projeto

| Dimensão | Decisão | Por quê | Revisar se |
| --- | --- | --- | --- |
| Sistema | Monólito modular (um `apps/api`) | Empresa pequena; fixo pela stack | — |
| Front | TanStack Start com SSR | Fixo pela stack | — |
| Estilo de API | REST + OpenAPI | Alimenta o cliente gerado pelo Kubb; fixo pela stack | — |
| Idioma | pt-BR, datas em UTC no banco | Fixo pela stack | — |
| Escala | Moderada | Poucos usuários simultâneos (<30), mas ~1 milhão de laudos e importação a cada 30 min; a lentidão do legado veio do desenho, não do volume | >100 usuários simultâneos ou exigência de alta disponibilidade |
| Arquitetura | Por contexto (ver `apps/api/CLAUDE.md`); vertical slice no `analytics` | Regra rica → DDD tático; regra rica + várias integrações ou entradas → hexagonal; painéis só de leitura → vertical slice com fórmulas de KPI centralizadas; senão modular | Um contexto ganha ou perde regra rica, integrações ou entradas |
| Nomes no código | Domínio em pt-BR sem acento, técnico em inglês | Linguagem ubíqua: termos como competência e repasse não têm tradução fiel | — |
| Multi-tenancy | Nenhum | Uma empresa com muitos clientes; contratados só emitem nota | O One for vendido para outras empresas |
| Login | Próprio (e-mail ou CPF + senha), sessão no banco em cookie `httpOnly`; robôs com chave de API própria | Sem custo externo; permite derrubar sessões | A equipe quiser SSO Google/Microsoft |
| Permissões | RBAC (papéis com permissões `tela.ação`) + recortes por atributo | O modelo do legado funciona; os recortes eram aplicados de forma inconsistente | Surgirem regras por cliente |
| Jobs | Fila no Postgres (graphile-worker), trabalhador no processo da API | Retentativa, uma por vez, sobrevive a deploy, histórico, e grava dado + tarefa na mesma transação; sem infra nova | Jobs deixam a API lenta (trabalhador separado); escala alta ou fluxos complexos (BullMQ + Redis) |
| Tempo real | Polling com intervalos por tela, parado com a aba oculta | O robô de distribuição consulta a API a cada 10 s; SSE ganharia ~3 s | O robô passar a receber tarefas por push ou surgir tela colaborativa (SSE nela) |
| Cache | Nenhum; tabelas de totais pré-somados atualizadas na importação | O cache do legado era apagado a cada importação; o problema eram varreduras completas | Consulta de dashboard >500 ms mesmo com os totais |
| Arquivos | Storage compatível com S3, privado, atrás de interface | Planilhas, contratos e PDFs; nunca no banco nem no disco da API | Surgir arquivo público (CDN) |
| Observabilidade | Logs JSON sem dados pessoais, health check, monitoramento de erros, alerta de job crítico que falhou | Saber de falhas antes do cliente | Dificuldade em achar a causa de lentidão (tracing) |
| Deploy | Containers (Dockerfile por app) numa VPS própria com proxy HTTPS; Postgres gerenciado; migrations antes da nova versão subir | Custo baixo; banco crítico com backup do provedor | Peso operacional da VPS (migrar para PaaS) |
| Ambientes | Dev local + produção | Simplicidade e custo | Primeiro incidente de faturamento causado por deploy (criar homologação) |
| LGPD | Minimizar e restringir dados pessoais e de saúde | Dados de saúde de pacientes e financeiros de médicos | Nova exigência legal ou de cliente |
| Auditoria | Nas entidades críticas | Sistema que fatura e paga; o legado só auditava a escala | Cliente ou contador exigir mais |
| SEO | `noindex` em tudo, `robots.txt` bloqueando | Tudo atrás de login | Surgir página pública |
| PWA | Nenhum | Uso interno no computador; portal do médico ainda desligado | Portal liberado e usado pelo celular (instalável) |

Decisões mudam por pedido explícito; ao mudar, atualize esta tabela.

- `apps/api`: NestJS (ver `apps/api/CLAUDE.md`)
- `apps/web`: TanStack Start (ver `apps/web/CLAUDE.md`)
- `packages/config`: tsconfig e Biome compartilhados

## Comandos

Sempre pela raiz, via Turborepo. Para um pacote só, use `--filter`:

```bash
pnpm lint | pnpm typecheck | pnpm test | pnpm build
pnpm check           # Biome: corrige lint, formatação e imports (check:ci no CI)
pnpm generate        # exporta o OpenAPI da API e gera o cliente Kubb do web
pnpm turbo run test --filter=@repo/api
pnpm add --save-exact <pacote> --filter @repo/web
```

## Regras

- Você decide sozinho quando, qual e como instalar dependências, sempre pela skill `add-dependency` (critérios, limites e quando perguntar antes). Versão exata (`--save-exact`), nunca `^` ou `~`.
- Commits **sempre** na especificação [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), validados pelo commitlint. Ver skill `conventional-commit`.
- **Desenvolvimento em TDD** em todos os apps e pacotes: teste falhando primeiro, depois a implementação mínima, depois refatoração. Ver skill `tdd`.
- Testes com Vitest, em `*.test.ts(x)` ao lado do código. Importe `describe`/`it`/`expect` de `vitest` (sem globals).
- Variáveis de ambiente ficam por app: novas entram no `.env.example` do app (`apps/api` ou `apps/web`), sem valores reais. Não há `.env` na raiz.
- Nunca edite arquivos gerados (`apps/web/src/routeTree.gen.ts`, `apps/web/src/gen/`, `apps/api/openapi.json`, migrations em `apps/api/drizzle/`).
- Para APIs de bibliotecas, consulte a documentação atual (MCP do Context7, ou as skills que vêm dentro dos pacotes em `node_modules/<pacote>/skills/`, como as do TanStack). As versões do template são recentes e podem diferir do que você conhece.

## Ferramentas do Claude Code neste repo

Configuradas em `.claude/settings.json`:

- Plugins: `typescript-lsp` (requer `typescript-language-server` no PATH), `security-guidance`, `claude-security`, `frontend-design`, `claude-md-management`, `context7` (servidor externo da Upstash), `playwright`. Para revisão de código, use os comandos embutidos `/code-review`, `/simplify` e `/security-review`.
- Hooks: Biome (lint, formatação e imports) no arquivo após cada edição; `typecheck` do monorepo ao final de cada turno.
