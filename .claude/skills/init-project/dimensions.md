# Dimensões do setup

Para cada dimensão: faça as perguntas, recomende **a opção mais simples que atende** e explique em linguagem simples (o usuário pode não conhecer o termo). A resposta de **Escala** influencia as outras: valide-a primeiro.

Bibliotecas e serviços citados abaixo são exemplos de categoria. A escolha concreta acontece só quando o primeiro módulo precisar, pela skill `add-dependency`.

## Fixas pela stack (não perguntar, só informar)

| Dimensão | Decisão | Motivo |
| --- | --- | --- |
| Sistema | Monólito modular (um `apps/api`) | Empresa pequena; sem microsserviços por enquanto |
| Front | TanStack Start com SSR | Stack do template |
| Estilo de API | REST + OpenAPI | Alimenta o cliente gerado pelo Kubb |
| Idioma | pt-BR, datas em UTC no banco | Sem i18n no template |

## 1. Escala e desempenho

- **Perguntas**: quantos usuários (simultâneos e totais) no primeiro ano? Volume de dados (milhares, milhões de registros)? Há picos (fechamento de mês, campanhas, prazos)? O sistema pode ficar fora do ar alguns minutos?
- **Opções**:
  - `baixa`: uso interno ou poucos clientes. Template como está.
  - `moderada`: centenas de usuários simultâneos ou milhões de registros. Índices planejados desde a primeira tabela, paginação obrigatória em toda listagem, tarefas pesadas fora da requisição (jobs).
  - `alta`: picos fortes ou exigência de disponibilidade. Tudo de `moderada` + API sem estado em memória (várias instâncias), cache, rate limit, observabilidade completa.

## 2. Arquitetura do backend

Ver a tabela de níveis no `SKILL.md` (etapa 2).

## 3. Multi-tenancy

Quando o mesmo sistema atende **várias empresas/clientes, cada um vendo só os próprios dados** (ex.: um SaaS).

- **Perguntas**: o sistema vai ser usado por mais de uma empresa/organização separada? Um cliente pode ver dados de outro em algum caso? Algum cliente exige banco isolado (contrato, compliance)?
- **Opções** (da mais simples):
  - `nenhum`: um cliente por instalação, ou sistema interno.
  - `coluna tenant_id`: todas as tabelas de negócio têm `tenant_id`; toda query filtra por ele. Mais simples e barato. Reforçar com Row Level Security do Postgres se o risco de vazamento for alto.
  - `schema por tenant` / `banco por tenant`: isolamento forte, operação bem mais cara (migrations em N bancos). Só com exigência contratual.
- **Impacto**: decidir agora; adicionar `tenant_id` depois em um sistema com dados é caro.

## 4. Autenticação e permissões

- **Perguntas**: quem acessa (funcionários, clientes externos, ambos)? Precisa entrar com conta Google/Microsoft da empresa (SSO)? Os perfis de acesso são poucos e fixos (admin, operador) ou dependem do dono do registro / de atributos (ex.: "gerente só vê a própria filial")?
- **Login**:
  - `próprio`: e-mail e senha na própria API (hash forte, recuperação de senha, bloqueio por tentativas).
  - `provedor externo`: OAuth/SSO (Google, Microsoft, Auth0, Clerk...). Menos código e mais seguro, mas pode ter custo e dependência externa (a skill `add-dependency` exige perguntar ao usuário).
- **Sessão**: para o próprio web, **cookie `httpOnly`** (padrão recomendado). JWT só se houver clientes de terceiros/mobile consumindo a API.
- **Permissões**:
  - `RBAC` (por papel): poucos perfis fixos. Mais simples.
  - `ABAC` (por atributo/dono): regras como "só o dono edita", "só a própria filial". Sempre que houver isso, a checagem fica no service/domínio, com teste.

## 5. Jobs e agendamentos

Tarefas que **não devem rodar dentro da requisição** (demoram, podem falhar e precisam de nova tentativa) ou que rodam **em horário marcado**.

- **Perguntas**: o sistema envia e-mails/SMS, gera relatórios/PDFs, importa planilhas, integra com APIs lentas? Algo roda todo dia/hora (cobranças, lembretes, limpezas)?
- **Opções**:
  - `nenhum`.
  - `agendamento simples no processo`: cron dentro da API. Só para tarefas leves e com uma instância.
  - `fila`: tarefas persistidas com retentativa. Começar com fila **no próprio Postgres** (sem infra nova); fila com Redis só com escala `alta`.

## 6. Tempo real

Atualizar a tela **sem o usuário recarregar** (notificações, chat, painel ao vivo, edição colaborativa).

- **Perguntas**: alguma tela precisa mudar sozinha quando algo acontece? Quão rápido (segundos basta, ou instantâneo)? Comunicação só do servidor para a tela, ou nos dois sentidos?
- **Opções**:
  - `nenhum` ou **polling** do TanStack Query (`refetchInterval`): resolve "atualizar a cada X segundos" sem infra nova.
  - `SSE`: só servidor → tela (notificações, progresso). Simples, funciona sobre HTTP.
  - `WebSocket`: dois sentidos (chat, colaboração).
- **Impacto**: com várias instâncias da API (escala `alta`), SSE/WebSocket precisam de um canal compartilhado (Postgres `LISTEN/NOTIFY` ou Redis).

## 7. Cache

- **Perguntas**: há dados lidos muito e alterados pouco (catálogos, configurações)? Consultas caras (relatórios, agregações)? Integrações externas lentas ou com limite de chamadas?
- **Opções**: `nenhum` (padrão; o TanStack Query já faz cache no front) → `em memória` (uma instância) → `Redis` (várias instâncias) → **cabeçalhos HTTP/CDN** para conteúdo público.
- **Regra**: todo cache tem uma estratégia de invalidação definida junto.

## 8. Arquivos

- **Perguntas**: usuários enviam arquivos (documentos, imagens)? Tamanho máximo? São privados (só o dono acessa) ou públicos?
- **Opções**: `nenhum` → **storage compatível com S3** (um container local no desenvolvimento), com upload direto por URL assinada e download privado por URL temporária. Nunca guardar arquivos no banco nem no disco da API.
- **Regras**: validar tipo e tamanho; arquivos pessoais entram na LGPD (exclusão).

## 9. Observabilidade

- **Perguntas**: quem descobre quando algo quebra em produção, e como? Precisa de alertas?
- **Mínimo para todo projeto**: logs estruturados (JSON) sem dados pessoais, endpoint de health check, monitoramento de erros.
- **Com escala `moderada`/`alta`**: métricas, tracing (OpenTelemetry) e alertas.

## 10. Deploy e ambientes

- **Perguntas**: onde vai rodar (nuvem própria, PaaS, servidor do cliente)? Quais ambientes (dev, homologação, produção)? Quem faz o deploy?
- **Opções**: **container** (Dockerfile por app; mais portável, padrão recomendado) ou **PaaS** que roda containers. Serverless não combina bem com NestJS + jobs + tempo real.
- **Regras**: migrations rodam no deploy antes da nova versão subir; segredos no gerenciador do provedor, nunca no repositório; homologação com dados fictícios.

## 11. LGPD e auditoria

- **Perguntas**: o sistema guarda dados de pessoas (nome, e-mail, CPF, telefone, endereço)? Dados sensíveis (saúde, biometria, religião, menores de idade)? Por quanto tempo os dados precisam ficar guardados? Precisa saber quem alterou o quê (exigência de cliente, financeiro, saúde)?
- **Se guarda dados pessoais** (quase sempre):
  - Mapear os campos pessoais de cada tabela (comentário no schema do Drizzle).
  - Coletar só o necessário; definir retenção.
  - Conseguir **exportar** e **excluir/anonimizar** os dados de uma pessoa.
  - Nunca registrar dados pessoais em logs nem enviá-los a serviços externos sem necessidade.
  - Dados sensíveis: avaliar criptografia do campo e acesso restrito.
- **Auditoria** (`nenhuma` / `nas entidades críticas` / `geral`): tabela de eventos com quem, quando, o quê, valor anterior e novo.

## 12. SEO

- **Perguntas**: o sistema tem páginas públicas que devem aparecer no Google ou gerar preview ao compartilhar o link (site, landing, catálogo, blog)? Ou é tudo atrás de login?
- **Com páginas públicas**: `title` e `description` por rota (`head` do TanStack Router), tags Open Graph, `sitemap.xml`, `robots.txt`, URLs legíveis, dados carregados no `loader` (já renderizados no SSR).
- **Só sistema logado**: `noindex` em todas as páginas e `robots.txt` bloqueando a indexação.

## 13. PWA (Progressive Web App)

O site pode ser **instalado no celular/computador como um app** (ícone na tela inicial, abre sem barra do navegador) e, opcionalmente, **funcionar sem internet** e receber **notificações push**.

- **Perguntas**: os usuários usam principalmente pelo celular? Precisam do sistema em lugares sem internet (equipes de campo, depósitos, eventos)? Precisam ser avisados mesmo com o sistema fechado (push)?
- **Opções** (da mais simples):
  - `nenhum`: site normal no navegador.
  - `instalável`: manifest (nome, ícones, cores do tema) + service worker básico. Ganha ícone e tela cheia, sem mudar o funcionamento.
  - `offline`: o app abre e mostra dados já carregados sem internet; ações feitas offline ficam numa fila e sincronizam ao reconectar. **Bem mais complexo**: exige decidir o que fica em cache, como resolver conflitos e testar sem rede.
  - `push`: notificações com o app fechado. Exige permissão do usuário, chaves VAPID e envio pelo backend (combina com a dimensão de jobs). No iOS só funciona com o app instalado.
- **Impacto**: `instalável` é barato e pode ser feito a qualquer momento. `offline` precisa ser decidido cedo, porque afeta como os dados são carregados e salvos. Nunca colocar em cache offline dados sensíveis (LGPD) sem necessidade.
