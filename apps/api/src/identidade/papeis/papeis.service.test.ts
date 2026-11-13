import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import type { PrincipalUsuario } from '../principal';
import {
  FixedClock,
  InMemoryGestaoPapeisRepository,
  InMemorySessoesRepository,
  InMemoryUsuariosRepository,
} from '../testing/fakes';
import {
  NomeDePapelEmUsoError,
  PapelDoSistemaError,
  PapelEmUsoError,
  PapelNaoEncontradoError,
  PermissaoInexistenteError,
  PermissaoNaoConcedivelError,
} from './papeis.errors';
import { PapeisService } from './papeis.service';

const AGORA = new Date('2026-11-13T12:00:00Z');

const admin: PrincipalUsuario = {
  tipo: 'usuario',
  usuarioId: 'u-admin',
  sessaoId: 's-admin',
  nome: 'Carlos',
  email: 'carlos@empresa.com.br',
  papelId: 'p-admin',
  acessoTotal: true,
  permissoes: new Set(),
};

const coordenadora: PrincipalUsuario = {
  ...admin,
  usuarioId: 'u-ana',
  papelId: 'p-coord',
  acessoTotal: false,
  permissoes: new Set(['papeis.ver', 'papeis.editar', 'escala.ver', 'escala.ausencia.aprovar']),
};

describe('PapeisService', () => {
  let usuarios: InMemoryUsuariosRepository;
  let papeis: InMemoryGestaoPapeisRepository;
  let sessoes: InMemorySessoesRepository;
  let auditoria: InMemoryAuditoria;
  let service: PapeisService;

  beforeEach(async () => {
    const pessoa = (id: string, papelId: string) => ({
      id,
      nome: id,
      email: `${id}@empresa.com.br`,
      papelId,
      senhaHash: null,
      ativo: true,
      tentativasFalhas: 0,
      bloqueadoAte: null,
    });
    usuarios = new InMemoryUsuariosRepository([
      pessoa('u-admin', 'p-admin'),
      pessoa('u-joao', 'p-fin'),
      pessoa('u-maria', 'p-fin'),
    ]);
    papeis = new InMemoryGestaoPapeisRepository(
      [
        {
          id: 'p-admin',
          nome: 'Administrador',
          descricao: null,
          sistema: true,
          acessoTotal: true,
          totalUsuarios: 0,
          permissoes: [],
        },
        {
          id: 'p-fin',
          nome: 'Financeiro',
          descricao: 'Faturamento e repasse',
          sistema: false,
          acessoTotal: false,
          totalUsuarios: 0,
          permissoes: ['faturamento.ver'],
        },
      ],
      usuarios,
    );
    sessoes = new InMemorySessoesRepository(usuarios);
    auditoria = new InMemoryAuditoria();
    service = new PapeisService(papeis, sessoes, auditoria, new FixedClock(AGORA));
    for (const usuarioId of ['u-joao', 'u-maria', 'u-admin']) {
      await sessoes.criar({
        usuarioId,
        tokenHash: `t-${usuarioId}`,
        criadaEm: AGORA,
        expiraEm: AGORA,
        expiraAbsolutoEm: AGORA,
        ip: null,
        userAgent: null,
      });
    }
  });

  describe('criar', () => {
    it('cria com as permissões normalizadas e registra na auditoria', async () => {
      const id = await service.criar(admin, {
        nome: 'Operação',
        descricao: null,
        permissoes: ['distribuicao.rodada.iniciar'],
      });

      expect(papeis.porId(id)).toMatchObject({
        nome: 'Operação',
        permissoes: ['distribuicao.rodada.iniciar', 'distribuicao.ver'],
      });
      expect(auditoria.eventos).toEqual([
        expect.objectContaining({
          ator: { tipo: 'usuario', id: 'u-admin' },
          entidade: 'papel',
          entidadeId: id,
          acao: 'criado',
          depois: {
            nome: 'Operação',
            permissoes: ['distribuicao.rodada.iniciar', 'distribuicao.ver'],
          },
          em: AGORA,
        }),
      ]);
    });

    it('recusa nome repetido, sem diferenciar maiúsculas', async () => {
      await expect(
        service.criar(admin, { nome: 'financeiro', descricao: null, permissoes: [] }),
      ).rejects.toThrow(NomeDePapelEmUsoError);
    });

    it('recusa permissão que não existe no catálogo', async () => {
      await expect(
        service.criar(admin, { nome: 'Novo', descricao: null, permissoes: ['usuarios.tudo'] }),
      ).rejects.toThrow(PermissaoInexistenteError);
    });

    it('quem não é Administrador só concede o que tem', async () => {
      await expect(
        service.criar(coordenadora, {
          nome: 'Escala',
          descricao: null,
          permissoes: ['escala.ausencia.aprovar', 'faturamento.competencia.fechar'],
        }),
      ).rejects.toThrow(PermissaoNaoConcedivelError);

      await expect(
        service.criar(coordenadora, {
          nome: 'Escala',
          descricao: null,
          permissoes: ['escala.ausencia.aprovar'],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('atualizar', () => {
    it('mudar as permissões encerra as sessões de quem tem o papel e audita antes e depois', async () => {
      const resultado = await service.atualizar(admin, 'p-fin', {
        nome: 'Financeiro',
        descricao: 'Faturamento e repasse',
        permissoes: ['faturamento.ver', 'repasse.fechar'],
      });

      expect(resultado).toEqual({ sessoesEncerradas: 2 });
      expect(sessoes.sessoes.filter((s) => s.encerradaEm).map((s) => s.usuarioId)).toEqual([
        'u-joao',
        'u-maria',
      ]);
      expect(auditoria.eventos).toEqual([
        expect.objectContaining({
          entidadeId: 'p-fin',
          acao: 'alterado',
          antes: { nome: 'Financeiro', permissoes: ['faturamento.ver'] },
          depois: {
            nome: 'Financeiro',
            permissoes: ['faturamento.ver', 'repasse.fechar', 'repasse.ver'],
          },
        }),
      ]);
    });

    it('só mudar o nome não encerra sessões', async () => {
      const resultado = await service.atualizar(admin, 'p-fin', {
        nome: 'Financeiro e repasse',
        descricao: null,
        permissoes: ['faturamento.ver'],
      });

      expect(resultado).toEqual({ sessoesEncerradas: 0 });
      expect(sessoes.sessoes.some((s) => s.encerradaEm)).toBe(false);
    });

    it('recusa papel do sistema e papel inexistente', async () => {
      const dados = { nome: 'Admin', descricao: null, permissoes: [] };

      await expect(service.atualizar(admin, 'p-admin', dados)).rejects.toThrow(PapelDoSistemaError);
      await expect(service.atualizar(admin, 'p-nada', dados)).rejects.toThrow(
        PapelNaoEncontradoError,
      );
    });

    it('permite manter o próprio nome, mas não usar o de outro papel', async () => {
      await expect(
        service.atualizar(admin, 'p-fin', { nome: 'FINANCEIRO', descricao: null, permissoes: [] }),
      ).resolves.toBeDefined();
      await expect(
        service.atualizar(admin, 'p-fin', {
          nome: 'administrador',
          descricao: null,
          permissoes: [],
        }),
      ).rejects.toThrow(NomeDePapelEmUsoError);
    });
  });

  describe('excluir', () => {
    it('recusa papel com usuários, dizendo quantos', async () => {
      const erro = await service.excluir(admin, 'p-fin').catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(PapelEmUsoError);
      expect((erro as PapelEmUsoError).totalUsuarios).toBe(2);
    });

    it('exclui papel sem usuários e registra na auditoria', async () => {
      const id = await service.criar(admin, { nome: 'Vazio', descricao: null, permissoes: [] });

      await service.excluir(admin, id);

      await expect(papeis.buscar(id)).resolves.toBeNull();
      expect(auditoria.eventos.at(-1)).toMatchObject({ entidadeId: id, acao: 'excluido' });
    });

    it('recusa papel do sistema', async () => {
      await expect(service.excluir(admin, 'p-admin')).rejects.toThrow(PapelDoSistemaError);
    });
  });
});
