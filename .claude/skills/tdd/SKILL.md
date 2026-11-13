---
name: tdd
description: Ciclo de TDD (red → green → refactor) com Vitest neste monorepo. Use ao implementar qualquer funcionalidade, correção de bug ou mudança de comportamento em apps/api, apps/web ou packages/*.
---

# TDD

Todo código de produção nasce de um teste que falhou antes.

## Ciclo

1. **Red**: escreva um teste que descreve o próximo comportamento pequeno. Rode-o e **confirme que falha pelo motivo esperado** (não por erro de import ou de digitação).
2. **Green**: escreva o mínimo de código para o teste passar. Rode de novo.
3. **Refactor**: com os testes verdes, melhore nomes, remova duplicação e extraia abstrações. Rode os testes após cada mudança.
4. Repita com o próximo comportamento. Não escreva vários testes de uma vez antes de implementar.

Para bugs: primeiro um teste que reproduz o bug (vermelho), depois a correção.

## Comandos

```bash
pnpm turbo run test --filter=@repo/api        # pacote inteiro
pnpm --filter @repo/api exec vitest run src/users/users.service.test.ts   # um arquivo
pnpm --filter @repo/api exec vitest src/users                             # modo watch
```

## Convenções

- Arquivo `nome.test.ts(x)` ao lado de `nome.ts(x)`.
- Importe `describe`, `it`, `expect`, `vi` de `vitest`.
- Nome do teste descreve o comportamento: `it('rejeita e-mail já cadastrado')`, não `it('testa create')`.
- Teste comportamento observável (retorno, efeito, erro lançado), não detalhes internos.
- Estrutura Arrange / Act / Assert, um comportamento por teste.
- Dependências externas (banco, HTTP, relógio) são substituídas por fakes ou mocks via interface. Lógica pura é testada sem mocks.

## Ao terminar

Rode `pnpm test` e `pnpm typecheck` na raiz e informe o resultado real (inclusive falhas).
