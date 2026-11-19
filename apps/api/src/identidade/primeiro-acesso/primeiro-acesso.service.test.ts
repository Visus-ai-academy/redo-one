import { describe, expect, it } from 'vitest';

import { SenhaService } from '../senha/senha.service';
import {
  FakePasswordHasher,
  FixedClock,
  InMemoryGestaoPapeisRepository,
  InMemoryGestaoUsuariosRepository,
  InMemorySessoesRepository,
  InMemoryTokensSenhaRepository,
  InMemoryUsuariosRepository,
} from '../testing/fakes';
import type { PapeisSistemaRepository } from './papeis-sistema.repository';
import { AdministradorJaExisteError, PrimeiroAcessoService } from './primeiro-acesso.service';

function montar() {
  const usuarios = new InMemoryUsuariosRepository();
  const papeis = new InMemoryGestaoPapeisRepository([], usuarios);
  const sessoes = new InMemorySessoesRepository(usuarios);
  const tokens = new InMemoryTokensSenhaRepository(usuarios);
  const relogio = new FixedClock(new Date('2026-11-13T12:00:00Z'));
  const sistema: PapeisSistemaRepository = {
    async garantir() {
      if (!papeis.papeis.length) {
        papeis.papeis.push({
          id: 'p-admin',
          nome: 'Administrador',
          descricao: null,
          sistema: true,
          acessoTotal: true,
          totalUsuarios: 0,
          permissoes: [],
        });
      }
      return { administradorId: 'p-admin' };
    },
    async existeAdministrador() {
      return usuarios.usuarios.some((u) => u.papelIds.includes('p-admin'));
    },
  };
  const senha = new SenhaService(
    usuarios,
    tokens,
    sessoes,
    new FakePasswordHasher(),
    relogio,
    'https://one.app',
  );
  const service = new PrimeiroAcessoService(
    sistema,
    new InMemoryGestaoUsuariosRepository(usuarios, papeis, sessoes, tokens),
    senha,
  );
  return { service, usuarios, tokens, papeis };
}

describe('PrimeiroAcessoService', () => {
  it('cria os papéis do sistema e o primeiro Administrador, e devolve o link do convite', async () => {
    const { service, usuarios, tokens, papeis } = montar();

    const { link } = await service.criarAdministrador({
      nome: 'Carlos Andrade',
      email: 'Carlos@Empresa.com.br',
    });

    expect(papeis.papeis.map((p) => p.nome)).toEqual(['Administrador']);
    expect(usuarios.usuarios).toMatchObject([
      { email: 'carlos@empresa.com.br', papelIds: ['p-admin'], senhaHash: null },
    ]);
    expect(link).toMatch(/^https:\/\/one\.app\/definir-senha\?token=/);
    expect(tokens.emails[0]?.texto).toContain(link);
  });

  it('recusa criar outro quando já existe Administrador', async () => {
    const { service } = montar();
    await service.criarAdministrador({ nome: 'Carlos', email: 'carlos@empresa.com.br' });

    await expect(
      service.criarAdministrador({ nome: 'Outra', email: 'outra@empresa.com.br' }),
    ).rejects.toThrow(AdministradorJaExisteError);
  });
});
