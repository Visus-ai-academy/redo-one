import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AutenticacaoGuard } from './acesso/autenticacao.guard';
import { PermissaoGuard } from './acesso/permissao.guard';
import { AutenticacaoService } from './autenticacao/autenticacao.service';
import { DrizzleTentativasLoginRepository } from './autenticacao/drizzle-tentativas-login.repository';
import { SessaoController } from './autenticacao/sessao.controller';
import { TENTATIVAS_LOGIN_REPOSITORY } from './autenticacao/tentativas-login.repository';
import { CLOCK, systemClock } from './clock';
import { ContaController } from './conta/conta.controller';
import { CONTA_REPOSITORY } from './conta/conta.repository';
import { ContaService } from './conta/conta.service';
import { DrizzleContaRepository } from './conta/drizzle-conta.repository';
import { DrizzleGestaoPapeisRepository } from './papeis/drizzle-gestao-papeis.repository';
import { DrizzlePapeisRepository } from './papeis/drizzle-papeis.repository';
import { GESTAO_PAPEIS_REPOSITORY } from './papeis/gestao-papeis.repository';
import { PapeisController } from './papeis/papeis.controller';
import { PAPEIS_REPOSITORY } from './papeis/papeis.repository';
import { PapeisService } from './papeis/papeis.service';
import { PermissoesController } from './papeis/permissoes.controller';
import { ChaveRoboAutenticador } from './robos/chave-robo-autenticador';
import { ChavesRoboController } from './robos/chaves-robo.controller';
import { CHAVES_ROBO_REPOSITORY } from './robos/chaves-robo.repository';
import { ChavesRoboService } from './robos/chaves-robo.service';
import { DrizzleChavesRoboRepository } from './robos/drizzle-chaves-robo.repository';
import { Argon2PasswordHasher } from './senha/argon2-password-hasher';
import { DrizzleTokensSenhaRepository } from './senha/drizzle-tokens-senha.repository';
import { PASSWORD_HASHER } from './senha/password-hasher';
import { SenhaController } from './senha/senha.controller';
import { SenhaService, URL_APP } from './senha/senha.service';
import { TOKENS_SENHA_REPOSITORY } from './senha/tokens-senha.repository';
import { DrizzleSessoesRepository } from './sessoes/drizzle-sessoes.repository';
import { SessaoAutenticador } from './sessoes/sessao-autenticador';
import { SESSOES_REPOSITORY } from './sessoes/sessoes.repository';
import { DrizzleGestaoUsuariosRepository } from './usuarios/drizzle-gestao-usuarios.repository';
import { DrizzleUsuariosRepository } from './usuarios/drizzle-usuarios.repository';
import { GESTAO_USUARIOS_REPOSITORY } from './usuarios/gestao-usuarios.repository';
import { UsuariosController } from './usuarios/usuarios.controller';
import { USUARIOS_REPOSITORY } from './usuarios/usuarios.repository';
import { UsuariosService } from './usuarios/usuarios.service';

/** Contexto `identidade`: login, sessões, usuários, papéis e permissões. */
@Module({
  controllers: [
    SessaoController,
    PapeisController,
    PermissoesController,
    SenhaController,
    UsuariosController,
    ContaController,
    ChavesRoboController,
  ],
  providers: [
    ChavesRoboService,
    ChaveRoboAutenticador,
    { provide: CHAVES_ROBO_REPOSITORY, useClass: DrizzleChavesRoboRepository },
    ContaService,
    { provide: CONTA_REPOSITORY, useClass: DrizzleContaRepository },
    UsuariosService,
    { provide: GESTAO_USUARIOS_REPOSITORY, useClass: DrizzleGestaoUsuariosRepository },
    SenhaService,
    { provide: TOKENS_SENHA_REPOSITORY, useClass: DrizzleTokensSenhaRepository },
    {
      provide: URL_APP,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        (config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, ''),
    },
    PapeisService,
    { provide: GESTAO_PAPEIS_REPOSITORY, useClass: DrizzleGestaoPapeisRepository },
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
