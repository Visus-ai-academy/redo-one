---
name: api-security-checklist
description: Checklist de segurança para o apps/api (NestJS). Use ao criar ou revisar endpoints, autenticação, bootstrap (main.ts), configuração ou acesso a banco.
---

# Checklist de segurança da API

Complementa o plugin `security-guidance` e o `/security-review`. Itens marcados com (dep) exigem dependência que o template ainda não tem: adicione seguindo a skill `add-dependency`.

## Bootstrap (`src/main.ts`)

- [ ] `ValidationPipe` global com `whitelist: true`, `forbidNonWhitelisted: true` e `transform: true` (dep: `class-validator`, `class-transformer`).
- [ ] Headers de segurança com `helmet` (dep).
- [ ] CORS explícito: `app.enableCors({ origin: <lista do ConfigService> })`, nunca `origin: '*'` com credenciais.
- [ ] Rate limiting com `@nestjs/throttler` (dep), principalmente em login, cadastro e recuperação de senha.
- [ ] `app.enableShutdownHooks()` para encerrar conexões corretamente.

## Entrada e saída

- [ ] Todo body, query e param tem DTO validado. Nada de `any` nem objeto cru do request.
- [ ] Respostas usam DTO de saída e nunca expõem hash de senha, tokens ou campos internos.
- [ ] Erros não vazam stack trace nem mensagens do banco (use um exception filter).
- [ ] Paginação com limite máximo nos endpoints de listagem.

## Autenticação e autorização

- [ ] Rotas protegidas por padrão (guard global) e liberadas explicitamente (`@Public()`).
- [ ] Autorização checa o dono do recurso, não só se o usuário está logado (evita IDOR).
- [ ] Senhas com `argon2` ou `bcrypt` (dep), nunca hash simples.
- [ ] Tokens com expiração curta e segredo vindo do `ConfigService`.

## Dados e configuração

- [ ] Queries parametrizadas ou ORM; nunca concatenar input em SQL.
- [ ] Segredos só em `.env` (fora do git); `.env.example` sem valores reais.
- [ ] Variáveis de ambiente validadas na inicialização (`ConfigModule.forRoot({ validate })`): a API não sobe com config faltando.
- [ ] Logs sem dados sensíveis (senha, token, documento).

## Testes

- [ ] Cada regra de autorização tem teste: acesso negado sem auth, acesso negado a recurso de outro usuário.
- [ ] Teste de validação: payload com campo extra ou inválido retorna 400.
