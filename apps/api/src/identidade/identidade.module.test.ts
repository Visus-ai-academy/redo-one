import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { DatabaseModule } from '../database/database.module';
import { AutenticacaoService } from './autenticacao/autenticacao.service';
import { DrizzleTentativasLoginRepository } from './autenticacao/drizzle-tentativas-login.repository';
import { SessaoController } from './autenticacao/sessao.controller';
import { TENTATIVAS_LOGIN_REPOSITORY } from './autenticacao/tentativas-login.repository';
import { IdentidadeModule } from './identidade.module';
import { DrizzlePapeisRepository } from './papeis/drizzle-papeis.repository';
import { PAPEIS_REPOSITORY } from './papeis/papeis.repository';
import { Argon2PasswordHasher } from './senha/argon2-password-hasher';
import { PASSWORD_HASHER } from './senha/password-hasher';
import { DrizzleSessoesRepository } from './sessoes/drizzle-sessoes.repository';
import { SessaoAutenticador } from './sessoes/sessao-autenticador';
import { SESSOES_REPOSITORY } from './sessoes/sessoes.repository';
import { DrizzleUsuariosRepository } from './usuarios/drizzle-usuarios.repository';
import { USUARIOS_REPOSITORY } from './usuarios/usuarios.repository';

// O mesmo que o AppModule monta para o contexto: config, banco e auditoria (globais) + identidade.
const MODULOS = [
  ConfigModule.forRoot({ isGlobal: true }),
  DatabaseModule,
  AuditoriaModule,
  IdentidadeModule,
];

describe('IdentidadeModule', () => {
  it('liga o controller de sessão às implementações reais', async () => {
    const modulo = await Test.createTestingModule({
      imports: MODULOS,
    }).compile();

    expect(modulo.get(SessaoController)).toBeInstanceOf(SessaoController);
    expect(modulo.get(AutenticacaoService)).toBeInstanceOf(AutenticacaoService);
    expect(modulo.get(USUARIOS_REPOSITORY)).toBeInstanceOf(DrizzleUsuariosRepository);
    expect(modulo.get(SESSOES_REPOSITORY)).toBeInstanceOf(DrizzleSessoesRepository);
    expect(modulo.get(TENTATIVAS_LOGIN_REPOSITORY)).toBeInstanceOf(
      DrizzleTentativasLoginRepository,
    );
    expect(modulo.get(PASSWORD_HASHER)).toBeInstanceOf(Argon2PasswordHasher);
    expect(modulo.get(PAPEIS_REPOSITORY)).toBeInstanceOf(DrizzlePapeisRepository);
    expect(modulo.get(SessaoAutenticador)).toBeInstanceOf(SessaoAutenticador);

    await modulo.close();
  });

  it('fecha toda rota por padrão: sem cookie, GET /sessao responde 401', async () => {
    const modulo = await Test.createTestingModule({
      imports: MODULOS,
    }).compile();
    const app = modulo.createNestApplication();
    await app.listen(0);
    const url = await app.getUrl();

    const resposta = await fetch(`${url.replace('[::1]', 'localhost')}/sessao`);

    expect(resposta.status).toBe(401);
    await app.close();
  });
});
