import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AutenticacaoGuard } from './acesso/autenticacao.guard';
import { PermissaoGuard } from './acesso/permissao.guard';
import { AutenticacaoService } from './autenticacao/autenticacao.service';
import { DrizzleTentativasLoginRepository } from './autenticacao/drizzle-tentativas-login.repository';
import { SessaoController } from './autenticacao/sessao.controller';
import { TENTATIVAS_LOGIN_REPOSITORY } from './autenticacao/tentativas-login.repository';
import { CLOCK, systemClock } from './clock';
import { DrizzlePapeisRepository } from './papeis/drizzle-papeis.repository';
import { PAPEIS_REPOSITORY } from './papeis/papeis.repository';
import { Argon2PasswordHasher } from './senha/argon2-password-hasher';
import { PASSWORD_HASHER } from './senha/password-hasher';
import { DrizzleSessoesRepository } from './sessoes/drizzle-sessoes.repository';
import { SessaoAutenticador } from './sessoes/sessao-autenticador';
import { SESSOES_REPOSITORY } from './sessoes/sessoes.repository';
import { DrizzleUsuariosRepository } from './usuarios/drizzle-usuarios.repository';
import { USUARIOS_REPOSITORY } from './usuarios/usuarios.repository';

/** Contexto `identidade`: login, sessões, usuários, papéis e permissões. */
@Module({
  controllers: [SessaoController],
  providers: [
    // Guards globais, nesta ordem: primeiro identifica quem é, depois confere a permissão.
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
    { provide: APP_GUARD, useClass: PermissaoGuard },
    AutenticacaoService,
    SessaoAutenticador,
    { provide: USUARIOS_REPOSITORY, useClass: DrizzleUsuariosRepository },
    { provide: SESSOES_REPOSITORY, useClass: DrizzleSessoesRepository },
    { provide: PAPEIS_REPOSITORY, useClass: DrizzlePapeisRepository },
    { provide: TENTATIVAS_LOGIN_REPOSITORY, useClass: DrizzleTentativasLoginRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class IdentidadeModule {}
