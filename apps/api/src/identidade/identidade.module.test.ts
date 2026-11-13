import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../database/database.module';
import { AutenticacaoService } from './autenticacao/autenticacao.service';
import { DrizzleTentativasLoginRepository } from './autenticacao/drizzle-tentativas-login.repository';
import { SessaoController } from './autenticacao/sessao.controller';
import { TENTATIVAS_LOGIN_REPOSITORY } from './autenticacao/tentativas-login.repository';
import { IdentidadeModule } from './identidade.module';
import { Argon2PasswordHasher } from './senha/argon2-password-hasher';
import { PASSWORD_HASHER } from './senha/password-hasher';
import { DrizzleSessoesRepository } from './sessoes/drizzle-sessoes.repository';
import { SESSOES_REPOSITORY } from './sessoes/sessoes.repository';
import { DrizzleUsuariosRepository } from './usuarios/drizzle-usuarios.repository';
import { USUARIOS_REPOSITORY } from './usuarios/usuarios.repository';

describe('IdentidadeModule', () => {
  it('liga o controller de sessão às implementações reais', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, IdentidadeModule],
    }).compile();

    expect(modulo.get(SessaoController)).toBeInstanceOf(SessaoController);
    expect(modulo.get(AutenticacaoService)).toBeInstanceOf(AutenticacaoService);
    expect(modulo.get(USUARIOS_REPOSITORY)).toBeInstanceOf(DrizzleUsuariosRepository);
    expect(modulo.get(SESSOES_REPOSITORY)).toBeInstanceOf(DrizzleSessoesRepository);
    expect(modulo.get(TENTATIVAS_LOGIN_REPOSITORY)).toBeInstanceOf(
      DrizzleTentativasLoginRepository,
    );
    expect(modulo.get(PASSWORD_HASHER)).toBeInstanceOf(Argon2PasswordHasher);

    await modulo.close();
  });
});
