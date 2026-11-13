---
name: conventional-commit
description: Escreve mensagens de commit seguindo a especificação Conventional Commits 1.0.0 (https://www.conventionalcommits.org/en/v1.0.0/), validada pelo commitlint deste repo. Use SEMPRE ao criar commits ou sugerir mensagens de commit.
---

# Conventional Commits 1.0.0

Todo commit segue a [especificação 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). O hook `commit-msg` roda `commitlint` com `@commitlint/config-conventional` e rejeita mensagens fora do padrão.

## Estrutura

```
<tipo>[escopo opcional][!]: <descrição>

[corpo opcional]

[rodapé(s) opcional(is)]
```

- **tipo**: obrigatório. `feat` para nova funcionalidade (MINOR no SemVer), `fix` para correção de bug (PATCH). Os demais aceitos pelo commitlint: `build`, `chore`, `ci`, `docs`, `perf`, `refactor`, `revert`, `style`, `test`.
- **escopo**: opcional, entre parênteses, um substantivo da parte afetada. Neste repo, o pacote sem o prefixo `@repo/`: `api`, `web`, `config`. Omita se a mudança afetar vários pacotes.
- **descrição**: logo após `: `. Resumo curto no imperativo, iniciando em minúscula, sem ponto final. O cabeçalho inteiro tem no máximo 100 caracteres.
- **corpo**: opcional, começa uma linha em branco após a descrição. Explica o porquê. Linhas de até 100 caracteres.
- **rodapés**: opcionais, uma linha em branco após o corpo. Formato `Token: valor` ou `Token #valor`, com `-` no lugar de espaços no token (ex.: `Reviewed-by: Z`, `Refs: #123`). A exceção é `BREAKING CHANGE`.

## Breaking change (MAJOR)

Indicada de uma (ou ambas) das formas:

- `!` antes do `:` no cabeçalho: `feat(api)!: remove endpoint de login legado`
- rodapé `BREAKING CHANGE: <descrição>` (em maiúsculas; `BREAKING-CHANGE` é sinônimo)

## Exemplos

```
feat(api): adiciona endpoint de cadastro de usuários
```

```
fix(web): corrige redirecionamento após login

O loader lia o cookie antes da hidratação e redirecionava
usuários autenticados para a tela de login.

Refs: #42
```

```
feat(api)!: exige autenticação em todas as rotas por padrão

BREAKING CHANGE: rotas públicas agora precisam do decorator @Public().
```

```
revert: feat(api): adiciona endpoint de cadastro de usuários

Refs: a1b2c3d
```

## Regras deste repo

- Um commit por mudança lógica. Em TDD, o teste e a implementação do mesmo comportamento vão juntos.
- Se o commit couber em mais de um tipo, divida em vários commits.
- Não use `--no-verify`. Se o lint-staged ou o commitlint falharem, corrija a causa.
- Não adicione linhas de atribuição (`Co-Authored-By` etc.).
