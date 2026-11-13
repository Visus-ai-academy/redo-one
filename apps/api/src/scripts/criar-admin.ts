// Cria os papéis do sistema e o primeiro Administrador num banco vazio. Uso:
//   pnpm --filter @repo/api admin:criar --nome "Carlos Andrade" --email carlos@empresa.com.br
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PrimeiroAcessoService } from '../identidade/primeiro-acesso/primeiro-acesso.service';

async function criarAdmin() {
  const { values } = parseArgs({
    options: { nome: { type: 'string' }, email: { type: 'string' } },
  });
  if (!values.nome || !values.email) {
    console.error(
      'Informe --nome e --email. Ex.: admin:criar --nome "Carlos" --email c@empresa.com.br',
    );
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const { link } = await app
      .get(PrimeiroAcessoService)
      .criarAdministrador({ nome: values.nome, email: values.email });
    console.log(`Administrador criado. O convite foi para ${values.email}.`);
    console.log(`Link para criar a senha (vale 7 dias, uso único):\n${link}`);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void criarAdmin();
