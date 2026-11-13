import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryPapeisRepository,
  InMemorySessoesRepository,
  InMemoryUsuariosRepository,
} from '../testing/fakes';
import { hashDoToken } from './abrir-sessao';
import { SessaoAutenticador } from './sessao-autenticador';

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const LOGIN = new Date('2026-11-13T12:00:00Z');

describe('SessaoAutenticador.autenticar', () => {
  let usuarios: InMemoryUsuariosRepository;
  let sessoes: InMemorySessoesRepository;
  let papeis: InMemoryPapeisRepository;
  let relogio: FixedClock;
  let autenticador: SessaoAutenticador;

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository([
      {
        id: 'u-maria',
        nome: 'Maria Souza',
        email: 'maria@empresa.com.br',
        papelId: 'p-financeiro',
        senhaHash: 'hash:x',
        ativo: true,
        tentativasFalhas: 0,
        bloqueadoAte: null,
      },
    ]);
    sessoes = new InMemorySessoesRepository(usuarios);
    papeis = new InMemoryPapeisRepository({
      'p-financeiro': {
        papel: 'Financeiro',
        acessoTotal: false,
        permissoes: ['faturamento.ver', 'repasse.ver'],
      },
    });
    relogio = new FixedClock(LOGIN);
    autenticador = new SessaoAutenticador(sessoes, papeis, relogio);
    await sessoes.criar({
      usuarioId: 'u-maria',
      tokenHash: hashDoToken('token-da-maria'),
      criadaEm: LOGIN,
      expiraEm: new Date(LOGIN.getTime() + 7 * DIA),
      expiraAbsolutoEm: new Date(LOGIN.getTime() + 30 * DIA),
      ip: null,
      userAgent: null,
    });
  });

  it('com token válido, devolve quem é e o que o papel permite', async () => {
    const principal = await autenticador.autenticar('token-da-maria');

    expect(principal).toMatchObject({
      tipo: 'usuario',
      usuarioId: 'u-maria',
      sessaoId: 's-1',
      nome: 'Maria Souza',
      email: 'maria@empresa.com.br',
      papelId: 'p-financeiro',
      papel: 'Financeiro',
      acessoTotal: false,
    });
    expect([...(principal?.permissoes ?? [])]).toEqual(['faturamento.ver', 'repasse.ver']);
  });

  it('marca acesso total para o papel Administrador', async () => {
    papeis.acessos['p-financeiro'] = { papel: 'Administrador', acessoTotal: true, permissoes: [] };

    await expect(autenticador.autenticar('token-da-maria')).resolves.toMatchObject({
      acessoTotal: true,
    });
  });

  it.each([
    ['token desconhecido', async () => 'outro-token'],
    [
      'sessão encerrada (logout)',
      async () => {
        await sessoes.encerrar('s-1', LOGIN);
        return 'token-da-maria';
      },
    ],
    [
      'usuário desativado',
      async () => {
        usuarios.porId('u-maria').ativo = false;
        return 'token-da-maria';
      },
    ],
    [
      '7 dias sem uso',
      async () => {
        relogio.avancar(7 * DIA);
        return 'token-da-maria';
      },
    ],
  ])('recusa: %s', async (_caso, preparar) => {
    const token = await preparar();

    await expect(autenticador.autenticar(token)).resolves.toBeNull();
  });

  it('usar a sessão empurra a expiração para 7 dias depois do uso', async () => {
    relogio.avancar(3 * DIA);

    await autenticador.autenticar('token-da-maria');

    expect(sessoes.porId('s-1')).toMatchObject({
      expiraEm: new Date(LOGIN.getTime() + 10 * DIA),
      ultimoUsoEm: new Date(LOGIN.getTime() + 3 * DIA),
    });
  });

  it('a renovação nunca passa do limite absoluto de 30 dias, que depois disso recusa', async () => {
    for (let dia = 6; dia < 30; dia += 6) {
      relogio.avancar(6 * DIA);
      await autenticador.autenticar('token-da-maria');
    }
    expect(sessoes.porId('s-1').expiraEm).toEqual(new Date(LOGIN.getTime() + 30 * DIA));

    relogio.avancar(6 * DIA);
    await expect(autenticador.autenticar('token-da-maria')).resolves.toBeNull();
  });

  it('usos com menos de 1 minuto de diferença não regravam a sessão', async () => {
    relogio.avancar(2 * MIN);
    await autenticador.autenticar('token-da-maria');
    relogio.avancar(30 * 1000);
    await autenticador.autenticar('token-da-maria');

    expect(sessoes.renovacoes).toBe(1);
  });
});
