---
name: hexagonal-architecture
description: Organização do apps/api em Clean Architecture / Hexagonal (ports & adapters) com NestJS. Use SOMENTE quando apps/api/CLAUDE.md declarar "Arquitetura deste projeto: hexagonal" (ou "clean"), ou quando o usuário pedir explicitamente para adotar essa arquitetura.
---

# Clean / Hexagonal no NestJS

Não é o padrão do template. Só vale para projetos com domínio rico, várias integrações externas ou necessidade de trocar infraestrutura. Se o projeto não declarou essa arquitetura em `apps/api/CLAUDE.md`, use a skill `nest-module`.

## Adotando em um projeto

1. Confirme com o usuário.
2. Troque a linha em `apps/api/CLAUDE.md` para `Arquitetura deste projeto: hexagonal`.
3. Aplique a estrutura abaixo aos módulos novos. Migre os existentes só se for pedido.

## Estrutura por módulo

```
src/<contexto>/
  domain/                 # entidades, value objects, erros de domínio, regras puras
                          # sem imports de @nestjs/*, ORM ou libs de infra
  application/
    ports/                # interfaces de saída (repositórios, gateways, relógio, e-mail)
    use-cases/            # um caso de uso por classe: execute(input): output
  infrastructure/
    persistence/          # adapters dos ports de banco, com Drizzle (`@Inject(DATABASE)`); tabelas continuam em src/database/schema
    http/                 # controllers, DTOs, mapeamento de erros para HTTP
  <contexto>.module.ts    # composição: liga ports a adapters via tokens
```

## Regra de dependência

`infrastructure → application → domain`. Nunca o inverso.

- `domain` não importa nada das outras camadas.
- `application` depende só de `domain` e dos próprios `ports`.
- O Nest (decorators, DI) fica em `infrastructure` e no `*.module.ts`. Use cases são classes simples; o módulo os registra com `useFactory`, ou com `@Injectable()` + `@Inject(TOKEN)` se a equipe preferir. Escolha uma forma e mantenha.

```ts
// application/ports/users.repository.ts
export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
export interface UsersRepository {
  findByEmail(email: Email): Promise<User | null>;
  save(user: User): Promise<void>;
}

// <contexto>.module.ts
providers: [
  { provide: USERS_REPOSITORY, useClass: DrizzleUsersRepository },
  {
    provide: RegisterUser,
    useFactory: (repo: UsersRepository) => new RegisterUser(repo),
    inject: [USERS_REPOSITORY],
  },
],
```

## TDD por camada

1. **Domain**: testes unitários puros, sem mocks. Comece aqui.
2. **Use cases**: testes com adapters in-memory dos ports.
3. **Adapters**: testes de integração (banco real via docker-compose, HTTP via `@nestjs/testing`).
4. **Controllers**: só mapeamento de entrada, saída e erros.

## Sinais de violação

- Entidade de domínio com decorator de ORM ou de validação HTTP.
- Use case recebendo ou retornando DTO HTTP ou entidade do ORM.
- Controller com regra de negócio.
- Import de `infrastructure/` dentro de `domain/` ou `application/`.
