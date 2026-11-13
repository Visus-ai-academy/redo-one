import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  FakePasswordHasher,
  FixedClock,
  InMemorySessoesRepository,
  InMemoryTentativasLoginRepository,
  InMemoryUsuariosRepository,
} from '../testing/fakes';
import type { UsuarioLogin } from '../usuarios/usuarios.repository';
import { AcessoBloqueadoError, CredenciaisInvalidasError } from './autenticacao.errors';
import { AutenticacaoService } from './autenticacao.service';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-13T12:00:00Z');

function usuario(dados: Partial<UsuarioLogin & { cpf: string | null }> = {}) {
  return {
    id: 'u-maria',
    nome: 'Maria Souza',
    email: 'maria@empresa.com.br',
    cpf: '12345678901',
    papelId: 'p-financeiro',
    senhaHash: 'hash:cafe2026',
    ativo: true,
    tentativasFalhas: 0,
    bloqueadoAte: null,
    ...dados,
  };
}

describe('AutenticacaoService.entrar', () => {
  let usuarios: InMemoryUsuariosRepository;
  let sessoes: InMemorySessoesRepository;
  let tentativas: InMemoryTentativasLoginRepository;
  let relogio: FixedClock;
  let service: AutenticacaoService;

  const entrar = (identificador: string, senha: string, ip = '177.32.0.1') =>
    service.entrar({ identificador, senha, ip, userAgent: 'Chrome no Windows' });

  beforeEach(() => {
    usuarios = new InMemoryUsuariosRepository([usuario()]);
    sessoes = new InMemorySessoesRepository();
    tentativas = new InMemoryTentativasLoginRepository();
    relogio = new FixedClock(AGORA);
    service = new AutenticacaoService(
      usuarios,
      sessoes,
      tentativas,
      new FakePasswordHasher(),
      relogio,
    );
  });

  it('com e-mail e senha corretos, abre sessão de 7 dias guardando só o hash do token', async () => {
    const resultado = await entrar('maria@empresa.com.br', 'cafe2026');

    expect(resultado.usuario).toEqual({
      id: 'u-maria',
      nome: 'Maria Souza',
      email: 'maria@empresa.com.br',
      papelId: 'p-financeiro',
    });
    expect(resultado.token.length).toBeGreaterThanOrEqual(43);
    expect(resultado.expiraEm).toEqual(new Date(AGORA.getTime() + 7 * DIA));

    const [sessao] = sessoes.sessoes;
    expect(sessao).toMatchObject({
      usuarioId: 'u-maria',
      tokenHash: createHash('sha256').update(resultado.token).digest('hex'),
      criadaEm: AGORA,
      expiraEm: new Date(AGORA.getTime() + 7 * DIA),
      expiraAbsolutoEm: new Date(AGORA.getTime() + 30 * DIA),
      ip: '177.32.0.1',
      userAgent: 'Chrome no Windows',
    });
  });

  it('com senha errada, recusa sem abrir sessão e conta a falha na conta e no IP', async () => {
    await expect(entrar('maria@empresa.com.br', 'errada123')).rejects.toThrow(
      CredenciaisInvalidasError,
    );

    expect(sessoes.sessoes).toHaveLength(0);
    expect(usuarios.porId('u-maria').tentativasFalhas).toBe(1);
    expect(tentativas.tentativas).toEqual([
      {
        ip: '177.32.0.1',
        usuarioId: 'u-maria',
        sucesso: false,
        userAgent: 'Chrome no Windows',
        em: AGORA,
      },
    ]);
  });

  it('com e-mail que não existe, dá a mesma resposta e registra a tentativa sem usuário', async () => {
    await expect(entrar('ninguem@empresa.com.br', 'cafe2026')).rejects.toThrow(
      CredenciaisInvalidasError,
    );

    expect(tentativas.tentativas).toMatchObject([{ usuarioId: null, sucesso: false }]);
  });

  it.each(['123.456.789-01', '12345678901', ' 123 456 789 01 '])(
    'entra pelo CPF digitado como "%s"',
    async (cpf) => {
      const resultado = await entrar(cpf, 'cafe2026');

      expect(resultado.usuario.id).toBe('u-maria');
    },
  );

  describe('bloqueio da conta', () => {
    const QUINZE_MIN = 15 * 60 * 1000;

    async function errarSenha(vezes: number) {
      for (let i = 0; i < vezes; i++) {
        await entrar('maria@empresa.com.br', 'errada123').catch(() => undefined);
      }
    }

    it('na 5ª falha seguida, bloqueia por 15 minutos e avisa até quando', async () => {
      await errarSenha(4);

      const erro = await entrar('maria@empresa.com.br', 'errada123').catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(AcessoBloqueadoError);
      expect((erro as AcessoBloqueadoError).ate).toEqual(new Date(AGORA.getTime() + QUINZE_MIN));
      expect(usuarios.porId('u-maria').bloqueadoAte).toEqual(
        new Date(AGORA.getTime() + QUINZE_MIN),
      );
    });

    it('durante o bloqueio, recusa até a senha certa', async () => {
      await errarSenha(5);
      relogio.avancar(QUINZE_MIN - 1000);

      await expect(entrar('maria@empresa.com.br', 'cafe2026')).rejects.toThrow(
        AcessoBloqueadoError,
      );
      expect(sessoes.sessoes).toHaveLength(0);
    });

    it('passados os 15 minutos, a senha certa entra e o contador volta a zero', async () => {
      await errarSenha(5);
      relogio.avancar(QUINZE_MIN);

      await entrar('maria@empresa.com.br', 'cafe2026');

      expect(usuarios.porId('u-maria')).toMatchObject({ tentativasFalhas: 0, bloqueadoAte: null });
    });
  });

  it('conta desativada recebe a mesma resposta de senha errada, mesmo com a senha certa', async () => {
    usuarios.porId('u-maria').ativo = false;

    await expect(entrar('maria@empresa.com.br', 'cafe2026')).rejects.toThrow(
      CredenciaisInvalidasError,
    );
    expect(sessoes.sessoes).toHaveLength(0);
  });

  it('convite ainda não aceito (sem senha) recebe a mesma resposta de senha errada', async () => {
    usuarios.porId('u-maria').senhaHash = null;

    await expect(entrar('maria@empresa.com.br', 'cafe2026')).rejects.toThrow(
      CredenciaisInvalidasError,
    );
  });

  describe('bloqueio por IP', () => {
    it('com 30 falhas do mesmo IP em 15 minutos, recusa esse IP, mas não os outros', async () => {
      for (let i = 0; i < 30; i++) {
        await entrar(`pessoa${i}@empresa.com.br`, 'errada123', '200.1.1.1').catch(() => undefined);
      }

      await expect(entrar('maria@empresa.com.br', 'cafe2026', '200.1.1.1')).rejects.toThrow(
        AcessoBloqueadoError,
      );
      await expect(entrar('maria@empresa.com.br', 'cafe2026', '177.32.0.1')).resolves.toBeDefined();
    });

    it('falhas com mais de 15 minutos não contam para o IP', async () => {
      for (let i = 0; i < 30; i++) {
        await entrar(`pessoa${i}@empresa.com.br`, 'errada123', '200.1.1.1').catch(() => undefined);
      }
      relogio.avancar(15 * 60 * 1000 + 1);

      await expect(entrar('maria@empresa.com.br', 'cafe2026', '200.1.1.1')).resolves.toBeDefined();
    });
  });

  it('login com sucesso zera as falhas anteriores e fica registrado', async () => {
    usuarios.porId('u-maria').tentativasFalhas = 3;

    await entrar('maria@empresa.com.br', 'cafe2026');

    expect(usuarios.porId('u-maria').tentativasFalhas).toBe(0);
    expect(tentativas.tentativas).toMatchObject([{ usuarioId: 'u-maria', sucesso: true }]);
  });

  it('aceita o e-mail com maiúsculas e espaços em volta', async () => {
    const resultado = await entrar('  Maria@Empresa.com.br ', 'cafe2026');

    expect(resultado.usuario.id).toBe('u-maria');
  });
});
