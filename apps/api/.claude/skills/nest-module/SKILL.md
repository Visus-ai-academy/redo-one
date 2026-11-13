---
name: nest-module
description: Cria um módulo de domínio no NestJS (module, controller, service, DTOs, testes) seguindo TDD e SOLID. Use ao adicionar um recurso, endpoint ou feature nova em apps/api.
---

# Novo módulo Nest

Antes de começar, confira a linha "Arquitetura deste projeto" em `apps/api/CLAUDE.md`:

- `modular`: siga esta skill.
- `modular-ddd`: siga esta skill **e** a seção "Variante modular-ddd" no final.
- `hexagonal` (ou `clean`): use a skill `hexagonal-architecture` no lugar desta.

Use os nomes do glossário em `CLAUDE.md` da raiz (seção "Projeto"), se existir, para classes, tabelas e rotas.

## Estrutura (arquitetura modular, padrão)

```
src/<recurso>/
  <recurso>.module.ts
  <recurso>.controller.ts        # só HTTP
  <recurso>.controller.test.ts
  <recurso>.service.ts           # regra de negócio
  <recurso>.service.test.ts
  <recurso>.repository.ts        # interface + token de injeção
  drizzle-<recurso>.repository.ts # implementação com Drizzle
  dto/create-<recurso>.dto.ts     # com @ApiProperty (OpenAPI → cliente do web)
src/database/schema/<recurso>.ts  # tabela Drizzle, reexportada em schema/index.ts
```

Registre o módulo em `imports` do `AppModule`. Depois de criar ou mudar a tabela, rode `db:generate`, revise o SQL e rode `db:migrate` (ver `apps/api/CLAUDE.md`).

## Ordem de trabalho (TDD)

1. **Service primeiro**: teste do comportamento de negócio com o repositório fake, depois a implementação mínima.
2. **Controller**: teste que o controller chama o service e mapeia resposta e erros HTTP.
3. **Repositório concreto**: implementação real da interface, com testes de integração quando houver banco.

Pode usar `pnpm --filter @repo/api exec nest g module|controller|service <nome> --no-spec` para o esqueleto. Os testes são `*.test.ts` criados à mão; não use os `.spec.ts` do CLI.

## SOLID na prática

Dependência externa atrás de interface + token (DIP):

```ts
// users.repository.ts
export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  findByEmail(email: string): Promise<User | null>;
  create(data: NewUser): Promise<User>;
}
```

```ts
// drizzle-users.repository.ts: único lugar do módulo que conhece o Drizzle
@Injectable()
export class DrizzleUsersRepository implements UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async create(data: NewUser) {
    const [user] = await this.db.insert(users).values(data).returning();
    return user!;
  }
}
```

```ts
// users.service.ts
@Injectable()
export class UsersService {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}
}
```

```ts
// users.module.ts
providers: [UsersService, { provide: USERS_REPOSITORY, useClass: DrizzleUsersRepository }],
```

Teste do service sem Nest, com fake (mais rápido e mais claro):

```ts
import { describe, expect, it } from 'vitest';

describe('UsersService', () => {
  it('rejeita e-mail já cadastrado', async () => {
    const repo = new InMemoryUsersRepository([existingUser]);
    const service = new UsersService(repo);

    await expect(service.register({ email: existingUser.email })).rejects.toThrow(
      EmailAlreadyInUseError,
    );
  });
});
```

Para testar a ligação de DI ou o controller, use `Test.createTestingModule` de `@nestjs/testing` com `overrideProvider(USERS_REPOSITORY).useValue(fake)`.

Regras:

- **SRP**: controller não contém regra de negócio; service não conhece `Request`/`Response`.
- **OCP/LSP**: um novo comportamento vem de uma nova implementação da interface, sem `if` por tipo no service.
- **ISP**: interfaces pequenas, desenhadas a partir de quem as consome.
- **DIP**: o service depende da interface, nunca da classe concreta de infraestrutura.
- Erros de domínio são classes próprias; o controller (ou um exception filter) as traduz para `HttpException`.

## Variante modular-ddd

Só quando `apps/api/CLAUDE.md` declarar `modular-ddd`. Mesma estrutura de módulo Nest, mas a regra de negócio sai do service e vai para um domínio rico dentro do módulo:

```
src/<contexto>/
  domain/
    <entidade>.ts            # entidade/agregado: estado + métodos que garantem as invariantes
    <valor>.ts               # value objects imutáveis, validados na criação (ex.: Email, Money)
    errors.ts                # erros de domínio
  <contexto>.repository.ts   # interface: salva e carrega o agregado inteiro
  drizzle-<contexto>.repository.ts
  <contexto>.service.ts      # orquestra: carrega o agregado, chama o método de domínio, salva
  <contexto>.controller.ts
```

- **Domínio sem framework**: `domain/` não importa `@nestjs/*`, `drizzle-orm` nem DTOs.
- **Invariantes no agregado**: `order.pay()` valida e muda o estado; o service não faz `order.status = 'paid'`.
- **Value objects** para conceitos com regra (e-mail, dinheiro, CPF), em vez de `string`/`number` soltos.
- **Um repositório por agregado**, que carrega e salva o agregado inteiro. O repositório converte entre a linha da tabela Drizzle e a entidade.
- **Nomes do glossário** (seção "Projeto" do `CLAUDE.md` da raiz) em classes, métodos e tabelas.
- **TDD começa pelo domínio**: testes puros das entidades e value objects, sem mocks; depois o service com repositório fake.
- Se o módulo passar a ter várias integrações externas ou infra trocável, considere subir para `hexagonal` (só esse módulo, se fizer sentido).

## Ao terminar

Revise o endpoint com a skill `api-security-checklist` e rode `pnpm turbo run lint typecheck test --filter=@repo/api`.
