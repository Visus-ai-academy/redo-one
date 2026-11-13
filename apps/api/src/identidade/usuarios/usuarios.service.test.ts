import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { PapelNaoEncontradoError } from '../papeis/papeis.errors';
import type { PrincipalUsuario } from '../principal';
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
import {
  AcaoSobreSiMesmoError,
  ConviteJaAceitoError,
  CpfEmUsoError,
  CpfInvalidoError,
  EmailEmUsoError,
  PapelNaoAtribuivelError,
  SessaoNaoEncontradaError,
} from './usuarios.errors';
import { UsuariosService } from './usuarios.service';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-13T12:00:00Z');

const ator = (dados: Partial<PrincipalUsuario>): PrincipalUsuario => ({
  tipo: 'usuario',
  usuarioId: 'u-admin',
  sessaoId: 's-x',
  nome: 'Carlos Andrade',
  email: 'carlos@empresa.com.br',
  papelId: 'p-admin',
  papel: 'Administrador',
  acessoTotal: true,
  permissoes: new Set(),
  ...dados,
});
const admin = ator({});
const coordenadora = ator({
  usuarioId: 'u-ana',
  nome: 'Ana',
  papelId: 'p-coord',
  acessoTotal: false,
  permissoes: new Set(['usuarios.ver', 'usuarios.convidar', 'escala.ver']),
});

describe('UsuariosService', () => {
  let usuarios: InMemoryUsuariosRepository;
  let papeis: InMemoryGestaoPapeisRepository;
  let sessoes: InMemorySessoesRepository;
  let tokens: InMemoryTokensSenhaRepository;
  let auditoria: InMemoryAuditoria;
  let relogio: FixedClock;
  let service: UsuariosService;

  const pessoa = (id: string, nome: string, papelId: string, extra = {}) => ({
    id,
    nome,
    email: `${id.slice(2)}@empresa.com.br`,
    cpf: null as string | null,
    papelId,
    senhaHash: 'hash:x',
    ativo: true,
    tentativasFalhas: 0,
    bloqueadoAte: null as Date | null,
    ...extra,
  });

  beforeEach(() => {
    usuarios = new InMemoryUsuariosRepository([
      pessoa('u-admin', 'Carlos Andrade', 'p-admin'),
      pessoa('u-ana', 'Ana', 'p-coord'),
      pessoa('u-joao', 'João', 'p-fin', { cpf: '12345678901' }),
      pessoa('u-paula', 'Paula', 'p-fin', {
        tentativasFalhas: 0,
        bloqueadoAte: new Date(AGORA.getTime() + 10 * 60 * 1000),
      }),
    ]);
    const papel = (id: string, nome: string, permissoes: string[], acessoTotal = false) => ({
      id,
      nome,
      descricao: null,
      sistema: acessoTotal,
      acessoTotal,
      totalUsuarios: 0,
      permissoes,
    });
    papeis = new InMemoryGestaoPapeisRepository(
      [
        papel('p-admin', 'Administrador', [], true),
        papel('p-coord', 'Coordenação', ['escala.ver']),
        papel('p-fin', 'Financeiro', ['faturamento.ver']),
      ],
      usuarios,
    );
    sessoes = new InMemorySessoesRepository(usuarios);
    tokens = new InMemoryTokensSenhaRepository(usuarios, {
      'p-admin': 'Administrador',
      'p-coord': 'Coordenação',
      'p-fin': 'Financeiro',
    });
    auditoria = new InMemoryAuditoria();
    relogio = new FixedClock(AGORA);
    const senha = new SenhaService(
      usuarios,
      tokens,
      sessoes,
      new FakePasswordHasher(),
      relogio,
      'https://one.app',
    );
    service = new UsuariosService(
      new InMemoryGestaoUsuariosRepository(usuarios, papeis, sessoes, tokens),
      papeis,
      sessoes,
      tokens,
      senha,
      auditoria,
      relogio,
    );
  });

  const abrirSessao = (usuarioId: string, tokenHash: string) =>
    sessoes.criar({
      usuarioId,
      tokenHash,
      criadaEm: AGORA,
      expiraEm: AGORA,
      expiraAbsolutoEm: AGORA,
      ip: null,
      userAgent: null,
    });

  describe('convidar', () => {
    it('cria a conta sem senha, manda o convite de 7 dias e registra na auditoria', async () => {
      const id = await service.convidar(admin, {
        nome: 'Maria Souza',
        email: ' Maria@Empresa.com.br ',
        cpf: '987.654.321-00',
        papelId: 'p-fin',
      });

      expect(usuarios.porId(id)).toMatchObject({
        email: 'maria@empresa.com.br',
        cpf: '98765432100',
        senhaHash: null,
        papelId: 'p-fin',
      });
      expect(tokens.tokens).toEqual([
        expect.objectContaining({
          usuarioId: id,
          tipo: 'convite',
          expiraEm: new Date(AGORA.getTime() + 7 * DIA),
          criadoPorId: 'u-admin',
        }),
      ]);
      expect(tokens.emails[0]?.texto).toContain(
        'Carlos Andrade convidou você para o One com o papel Financeiro.',
      );
      expect(auditoria.eventos).toEqual([
        expect.objectContaining({
          entidade: 'usuario',
          entidadeId: id,
          acao: 'convidado',
          depois: { nome: 'Maria Souza', email: 'maria@empresa.com.br', papelId: 'p-fin' },
        }),
      ]);
    });

    it('recusa e-mail ou CPF já cadastrados e CPF com tamanho errado', async () => {
      const base = { nome: 'X', papelId: 'p-fin', cpf: null };

      await expect(
        service.convidar(admin, { ...base, email: 'JOAO@empresa.com.br' }),
      ).rejects.toThrow(EmailEmUsoError);
      await expect(
        service.convidar(admin, { ...base, email: 'x@empresa.com.br', cpf: '123.456.789-01' }),
      ).rejects.toThrow(CpfEmUsoError);
      await expect(
        service.convidar(admin, { ...base, email: 'x@empresa.com.br', cpf: '1234' }),
      ).rejects.toThrow(CpfInvalidoError);
    });

    it('só atribui papel cujas permissões quem convida também tem', async () => {
      const dados = { nome: 'X', email: 'x@empresa.com.br', cpf: null };

      await expect(service.convidar(coordenadora, { ...dados, papelId: 'p-fin' })).rejects.toThrow(
        PapelNaoAtribuivelError,
      );
      await expect(
        service.convidar(coordenadora, { ...dados, papelId: 'p-admin' }),
      ).rejects.toThrow(PapelNaoAtribuivelError);
      await expect(
        service.convidar(coordenadora, { ...dados, papelId: 'p-coord' }),
      ).resolves.toBeDefined();
      await expect(
        service.convidar(admin, { ...dados, email: 'y@empresa.com.br', papelId: 'p-nada' }),
      ).rejects.toThrow(PapelNaoEncontradoError);
    });
  });

  describe('reenviarConvite', () => {
    it('manda um link novo e invalida o anterior', async () => {
      const id = await service.convidar(admin, {
        nome: 'Maria',
        email: 'maria@empresa.com.br',
        cpf: null,
        papelId: 'p-fin',
      });
      relogio.avancar(DIA);

      await service.reenviarConvite(admin, id);

      expect(tokens.tokens.map((t) => t.usadoEm)).toEqual([new Date(AGORA.getTime() + DIA), null]);
      expect(tokens.emails).toHaveLength(2);
      expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'convite_reenviado' });
    });

    it('recusa quando o convite já foi aceito', async () => {
      await expect(service.reenviarConvite(admin, 'u-joao')).rejects.toThrow(ConviteJaAceitoError);
    });
  });

  describe('trocarPapel', () => {
    it('troca, encerra as sessões da pessoa e audita o antes e o depois', async () => {
      await abrirSessao('u-joao', 'a');

      await service.trocarPapel(admin, 'u-joao', 'p-coord');

      expect(usuarios.porId('u-joao').papelId).toBe('p-coord');
      expect(sessoes.porId('s-1').encerradaEm).toEqual(AGORA);
      expect(auditoria.eventos).toEqual([
        expect.objectContaining({
          entidadeId: 'u-joao',
          acao: 'papel_trocado',
          antes: { papelId: 'p-fin' },
          depois: { papelId: 'p-coord' },
        }),
      ]);
    });

    it('ninguém troca o próprio papel', async () => {
      await expect(service.trocarPapel(admin, 'u-admin', 'p-fin')).rejects.toThrow(
        AcaoSobreSiMesmoError,
      );
    });
  });

  it('desbloquear zera as falhas, libera na hora e registra quem liberou', async () => {
    await service.desbloquear(admin, 'u-paula');

    expect(usuarios.porId('u-paula')).toMatchObject({ tentativasFalhas: 0, bloqueadoAte: null });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'usuario', id: 'u-admin' },
        entidadeId: 'u-paula',
        acao: 'desbloqueado',
      }),
    ]);
  });

  describe('desativar e reativar', () => {
    it('desativar tira o acesso na hora (encerra as sessões); reativar devolve', async () => {
      await abrirSessao('u-joao', 'a');

      await service.desativar(admin, 'u-joao');
      expect(usuarios.porId('u-joao').ativo).toBe(false);
      expect(sessoes.porId('s-1').encerradaEm).toEqual(AGORA);

      await service.reativar(admin, 'u-joao');
      expect(usuarios.porId('u-joao').ativo).toBe(true);
      expect(auditoria.eventos.map((e) => e.acao)).toEqual(['desativado', 'reativado']);
    });

    it('ninguém se desativa', async () => {
      await expect(service.desativar(admin, 'u-admin')).rejects.toThrow(AcaoSobreSiMesmoError);
    });
  });

  describe('encerrarSessoes', () => {
    it('encerra todas as sessões ou só a escolhida', async () => {
      await abrirSessao('u-joao', 'a');
      await abrirSessao('u-joao', 'b');

      await service.encerrarSessoes(admin, 'u-joao', 's-1');
      expect(sessoes.sessoes.map((s) => s.encerradaEm)).toEqual([AGORA, null]);

      await service.encerrarSessoes(admin, 'u-joao');
      expect(sessoes.sessoes.map((s) => s.encerradaEm)).toEqual([AGORA, AGORA]);
    });

    it('recusa sessão que não é da pessoa', async () => {
      await abrirSessao('u-ana', 'a');

      await expect(service.encerrarSessoes(admin, 'u-joao', 's-1')).rejects.toThrow(
        SessaoNaoEncontradaError,
      );
    });
  });

  it('enviar link de nova senha pela tela emite recuperação em nome de quem pediu', async () => {
    await service.enviarLinkSenha(admin, 'u-joao');

    expect(tokens.tokens).toEqual([
      expect.objectContaining({ usuarioId: 'u-joao', tipo: 'recuperacao', criadoPorId: 'u-admin' }),
    ]);
    expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'link_senha_enviado' });
  });

  it('lista com filtro de situação e paginação', async () => {
    const bloqueados = await service.listar({ situacao: 'bloqueado', pagina: 1, porPagina: 25 });
    expect(bloqueados).toMatchObject({
      total: 1,
      itens: [{ id: 'u-paula', situacao: 'bloqueado' }],
    });

    const pagina2 = await service.listar({ pagina: 2, porPagina: 3 });
    expect(pagina2.total).toBe(4);
    expect(pagina2.itens.map((u) => u.nome)).toEqual(['Paula']);
  });
});
