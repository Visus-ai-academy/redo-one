import { beforeEach, describe, expect, it } from 'vitest';

import { hashDoToken } from '../sessoes/abrir-sessao';
import {
  FakePasswordHasher,
  FixedClock,
  InMemorySessoesRepository,
  InMemoryTokensSenhaRepository,
  InMemoryUsuariosRepository,
} from '../testing/fakes';
import { LinkSenhaInvalidoError, SenhaFracaError } from './senha.errors';
import { SenhaService } from './senha.service';

const MIN = 60 * 1000;
const AGORA = new Date('2026-11-13T12:00:00Z');
const APP = 'https://one.app';

/** O token sai só no e-mail: o teste lê do link, como a pessoa faria. */
function tokenDoEmail(texto: string) {
  const token = /token=([\w-]+)/.exec(texto)?.[1];
  if (!token) throw new Error('e-mail sem link');
  return token;
}

describe('SenhaService', () => {
  let usuarios: InMemoryUsuariosRepository;
  let tokens: InMemoryTokensSenhaRepository;
  let sessoes: InMemorySessoesRepository;
  let relogio: FixedClock;
  let service: SenhaService;

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository([
      {
        id: 'u-maria',
        nome: 'Maria Souza',
        email: 'maria@empresa.com.br',
        papelId: 'p-fin',
        senhaHash: 'hash:antiga123',
        ativo: true,
        tentativasFalhas: 3,
        bloqueadoAte: new Date(AGORA.getTime() + 10 * MIN),
      },
    ]);
    tokens = new InMemoryTokensSenhaRepository(usuarios, { 'p-fin': 'Financeiro' });
    sessoes = new InMemorySessoesRepository(usuarios);
    relogio = new FixedClock(AGORA);
    service = new SenhaService(usuarios, tokens, sessoes, new FakePasswordHasher(), relogio, APP);
  });

  describe('solicitarRecuperacao', () => {
    it('emite link de 1 hora e enfileira o e-mail com ele', async () => {
      await service.solicitarRecuperacao(' Maria@Empresa.com.br ');

      expect(tokens.tokens).toEqual([
        expect.objectContaining({
          usuarioId: 'u-maria',
          tipo: 'recuperacao',
          expiraEm: new Date(AGORA.getTime() + 60 * MIN),
          criadoPorId: null,
        }),
      ]);
      const [email] = tokens.emails;
      expect(email?.para).toBe('maria@empresa.com.br');
      expect(email?.texto).toContain(`${APP}/definir-senha?token=`);
      expect(tokens.tokens[0]?.tokenHash).toBe(hashDoToken(tokenDoEmail(email?.texto ?? '')));
    });

    it('para e-mail sem conta, conta desativada ou convite pendente, não faz nada (e não avisa)', async () => {
      await service.solicitarRecuperacao('ninguem@empresa.com.br');
      usuarios.porId('u-maria').ativo = false;
      await service.solicitarRecuperacao('maria@empresa.com.br');
      Object.assign(usuarios.porId('u-maria'), { ativo: true, senhaHash: null });
      await service.solicitarRecuperacao('maria@empresa.com.br');

      expect(tokens.tokens).toHaveLength(0);
    });

    it('pedidos repetidos em menos de 1 minuto não mandam outro e-mail', async () => {
      await service.solicitarRecuperacao('maria@empresa.com.br');
      relogio.avancar(30 * 1000);
      await service.solicitarRecuperacao('maria@empresa.com.br');
      relogio.avancar(31 * 1000);
      await service.solicitarRecuperacao('maria@empresa.com.br');

      expect(tokens.emails).toHaveLength(2);
    });
  });

  describe('consultarLink e definirSenha', () => {
    let token: string;

    beforeEach(async () => {
      await service.solicitarRecuperacao('maria@empresa.com.br');
      token = tokenDoEmail(tokens.emails[0]?.texto ?? '');
    });

    it('consulta o link e diz de quem é a conta', async () => {
      await expect(service.consultarLink(token)).resolves.toEqual({
        tipo: 'recuperacao',
        nome: 'Maria Souza',
        email: 'maria@empresa.com.br',
        papel: 'Financeiro',
        convidadoPor: null,
      });
    });

    it('define a senha, desbloqueia a conta, encerra as outras sessões e já entra', async () => {
      await sessoes.criar({
        usuarioId: 'u-maria',
        tokenHash: 'sessao-antiga',
        criadaEm: AGORA,
        expiraEm: AGORA,
        expiraAbsolutoEm: AGORA,
        ip: null,
        userAgent: null,
      });

      const sessao = await service.definirSenha({
        token,
        senha: 'nova2026',
        ip: '1.1.1.1',
        userAgent: 'Chrome',
      });

      expect(usuarios.porId('u-maria')).toMatchObject({
        senhaHash: 'hash:nova2026',
        tentativasFalhas: 0,
        bloqueadoAte: null,
      });
      expect(sessoes.porId('s-1').encerradaEm).toEqual(AGORA);
      expect(sessao.usuario.id).toBe('u-maria');
      expect(sessoes.sessoes.at(-1)).toMatchObject({ ip: '1.1.1.1', encerradaEm: null });
    });

    it('recusa senha fraca dizendo o que falta, sem gastar o link', async () => {
      const erro = await service
        .definirSenha({ token, senha: 'curta', ip: '1.1.1.1', userAgent: null })
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(SenhaFracaError);
      expect((erro as SenhaFracaError).problemas).toEqual([
        'Use pelo menos 8 caracteres.',
        'Use letras e números.',
      ]);
      await expect(service.consultarLink(token)).resolves.toBeDefined();
    });

    it('o link vale uma vez só', async () => {
      await service.definirSenha({ token, senha: 'nova2026', ip: '1.1.1.1', userAgent: null });

      await expect(service.consultarLink(token)).rejects.toThrow(LinkSenhaInvalidoError);
      await expect(
        service.definirSenha({ token, senha: 'outra2026', ip: '1.1.1.1', userAgent: null }),
      ).rejects.toThrow(LinkSenhaInvalidoError);
    });

    it('link vencido (1 hora), substituído por um novo ou desconhecido não vale', async () => {
      relogio.avancar(61 * MIN);
      await expect(service.consultarLink(token)).rejects.toThrow(LinkSenhaInvalidoError);

      await service.solicitarRecuperacao('maria@empresa.com.br');
      const novo = tokenDoEmail(tokens.emails[1]?.texto ?? '');
      await expect(service.consultarLink(token)).rejects.toThrow(LinkSenhaInvalidoError);
      await expect(service.consultarLink(novo)).resolves.toBeDefined();

      await expect(service.consultarLink('inventado')).rejects.toThrow(LinkSenhaInvalidoError);
    });

    it('conta desativada depois do envio não usa o link', async () => {
      usuarios.porId('u-maria').ativo = false;

      await expect(service.consultarLink(token)).rejects.toThrow(LinkSenhaInvalidoError);
    });
  });
});
