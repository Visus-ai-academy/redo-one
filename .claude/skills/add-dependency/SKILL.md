---
name: add-dependency
description: Decide sozinho se uma biblioteca é necessária, qual escolher e como instalá-la no monorepo. Use SEMPRE antes de adicionar, trocar ou remover qualquer dependência (pnpm add/remove) em apps/* ou packages/*, inclusive quando outra skill pedir uma dependência.
---

# Escolher e instalar dependências

Você tem autonomia para decidir **quando**, **qual** e **como** instalar bibliotecas, seguindo este processo. Decida e execute. Peça confirmação só nos casos da seção "Quando perguntar antes".

## 1. Precisa mesmo de uma lib?

Instale só se pelo menos uma destas condições for verdadeira:

- O problema é complexo ou sensível o bastante para que código próprio seja um risco: criptografia, hash de senha, parsing de datas e fusos, sanitização de HTML, auth, acessibilidade de componentes complexos.
- A lib já é padrão da stack para esse problema (ver tabela abaixo).
- Escrever à mão levaria mais de ~50 linhas de código não trivial que a lib resolve de forma testada.

Não instale para coisas que a plataforma ou a stack já fazem: `fetch`, `structuredClone`, `Intl`, `crypto.randomUUID`, `Array`/`Object` modernos, utilidades de uma linha (`lodash` só para `get`/`debounce`, por exemplo).

## 2. Primeiro a stack existente

Antes de buscar algo novo, confira o `CLAUDE.md` do app (tabela "Stack") e o `package.json`. Se já existe uma lib que cobre o caso, use-a. Não introduza uma segunda lib para o mesmo papel (dois validadores, dois clientes HTTP, duas libs de data).

Escolhas já feitas no template:

| Papel                | Onde  | Escolha                                        |
| -------------------- | ----- | ---------------------------------------------- |
| Testes               | todos | Vitest                                         |
| Validação            | web   | Zod 4                                          |
| Formulários          | web   | TanStack Form                                  |
| Tabelas              | web   | TanStack Table                                 |
| Dados do servidor    | web   | TanStack Query + cliente Kubb                  |
| Componentes headless | web   | Base UI                                        |
| Estilo e tema        | web   | Tailwind CSS v4 + tokens shadcn + `cn`         |
| Animações            | web   | `tw-animate-css`                               |
| Banco de dados       | api   | Drizzle ORM + `pg` (PostgreSQL)                |
| Roteamento           | web   | TanStack Router/Start                          |
| Framework HTTP       | api   | NestJS (pacotes `@nestjs/*` oficiais primeiro) |

No `api`, prefira o pacote oficial `@nestjs/*` quando existir (`@nestjs/config`, `@nestjs/throttler`, `@nestjs/swagger`).

## 3. Avaliar candidatos

Compare de 1 a 3 candidatos. Para cada um, colete os dados reais (não confie na memória, porque as versões do template são recentes):

```bash
npm view <pacote> version deprecated license repository.url time.modified peerDependencies engines
curl -s https://api.npmjs.org/downloads/point/last-week/<pacote>
```

Use o MCP do Context7 para ler a documentação atual e confirmar a API.

Critérios eliminatórios (qualquer um descarta o candidato):

- `deprecated`, ou repositório arquivado.
- Sem release há mais de 18 meses (exceto libs pequenas e "terminadas", sem issues de segurança abertas).
- Licença fora de MIT, MIT-0, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD ou MPL-2.0.
- `peerDependencies` incompatíveis com as versões do repo (React 19, TypeScript 6, Node do `.nvmrc`, Zod 4).
- Vulnerabilidade conhecida sem correção.
- Pacote com nome parecido com um popular (typosquatting). Confira o repositório e o autor.

Critérios de desempate, nesta ordem:

1. Integração com a stack (feita para TanStack, Zod, NestJS ou React 19 vence uma genérica).
2. Tipos TypeScript nativos (não depender de `@types/*`).
3. ESM e tree-shakeable, com bundle pequeno (só no `web`, que vai para o navegador).
4. Manutenção ativa e adoção (downloads semanais, releases recentes).
5. Menos dependências transitivas.

## 4. Instalar

```bash
pnpm add --save-exact <pacote> --filter @repo/<app>       # runtime
pnpm add --save-exact -D <pacote> --filter @repo/<app>    # só build, teste ou geração
```

- Sempre `--save-exact` e sempre `--filter`. Nunca instale na raiz, exceto ferramentas do repo inteiro (turbo, biome, husky).
- Coloque no app que usa a lib. Só vai para um `packages/*` se for compartilhada.
- Sempre `pnpm`, nunca `npm`/`yarn` (o repo bloqueia o npm de propósito).
- Só entram versões publicadas há **pelo menos 7 dias** (`minimumReleaseAge` no `pnpm-workspace.yaml`). Ao escolher a versão exata, pegue a mais nova que já tenha 7 dias (`npm view <pacote> time --json`). Se o install falhar com `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, use uma versão anterior. **Nunca** adicione entradas em `minimumReleaseAgeExclude` ou `trustPolicyExclude`, nem afrouxe essas regras, sem perguntar.
- `ERR_PNPM_TRUST_DOWNGRADE` é sinal de alerta (possível conta comprometida): pare e avise o usuário.
- Pacotes com scripts de instalação ficam bloqueados (`strictDepBuilds`). Negar (`'<pacote>': false` em `allowBuilds`) você pode fazer sozinho quando o pacote funciona sem o script (telemetria, binário opcional). Liberar (`true`) só perguntando.
- `pnpm approve` (skills de agente trazidas por pacotes) é decisão do usuário. Só informe.

## 5. Validar e registrar

1. Escreva um teste que use a lib no caso real (skill `tdd`).
2. Rode `pnpm audit --prod` e `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
3. Se a lib define um papel novo na stack (não só um utilitário pontual), adicione uma linha na tabela "Stack" do `CLAUDE.md` do app. Assim a próxima decisão parte dela.
4. Se a lib exige variável de ambiente, adicione ao `.env.example` do app.
5. No resumo para o usuário, liste cada lib instalada com a versão e uma frase dizendo por que ela e não as alternativas.

Para remover: `pnpm remove <pacote> --filter @repo/<app>`. Remova também o uso no código, a linha da tabela "Stack" e as variáveis de ambiente que ficarem sem uso.

## Quando perguntar antes

Decida sozinho em todos os casos, exceto quando a lib:

- **substitui** algo que já está na tabela "Stack" (por exemplo, trocar Zod por Valibot);
- exige **conta, chave de API ou serviço externo pago** (Sentry, Stripe, Auth0, Clerk);
- tem licença fora da lista acima;
- precisa de **script de instalação liberado** (`allowBuilds: true`);
- só existe em versão com menos de 7 dias, ou dispara `ERR_PNPM_TRUST_DOWNGRADE`.

Nesses casos, apresente os candidatos avaliados com os dados do passo 3 e uma recomendação, e espere a resposta.
