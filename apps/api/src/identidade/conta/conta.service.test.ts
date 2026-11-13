import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import type { PrincipalUsuario } from '../principal';
import { SenhaFracaError } from '../senha/senha.errors';
import {
  FakePasswordHasher,
  FixedClock,
  InMemoryContaRepository,
  InMemoryGestaoPapeisRepository,
  InMemoryGestaoUsuariosRepository,
  InMemorySessoesRepository,
  InMemoryTentativasLoginRepository,
  InMemoryTokensSenhaRepository,
  InMemoryUsuariosRepository,
} from '../testing/fakes';
import { SenhaAtualIncorretaError } from './conta.errors';
import { ContaService } from './conta.service';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-13T12:00:00Z');

describe('ContaService (Meu perfil)', () => {
  let usuarios: InMemoryUsuariosRepository;
  let sessoes: InMemorySessoesRepository;
  let tentativas: InMemoryTentativasLoginRepository;
  let conta: InMemoryContaRepository;
  let auditoria: InMemoryAuditoria;
  let service: ContaService;
  let eu: PrincipalUsuario;

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository([
      {
        id: 'u-carlos',
        nome: 'Carlos Andrade',
        email: 'carlos@empresa.com.br',
        cpf: '12345678941',
        papelId: 'p-admin',
        senhaHash: 'hash:atual2026',
        ativo: true,
        tentativasFalhas: 0,
        bloqueadoAte: null,
      },
    ]);
    const papeis = new InMemoryGestaoPapeisRepository(
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
      ],
      usuarios,
    );
    sessoes = new InMemorySessoesRepository(usuarios);
    tentativas = new InMemoryTentativasLoginRepository();
    conta = new InMemoryContaRepository(usuarios, tentativas);
    auditoria = new InMemoryAuditoria();
    const gestao = new InMemoryGestaoUsuariosRepository(
      usuarios,
      papeis,
      sessoes,
      new InMemoryTokensSenhaRepository(usuarios),
    );
    service = new ContaService(
      gestao,
      conta,
      sessoes,
      new FakePasswordHasher(),
      auditoria,
      new FixedClock(AGORA),
    );
    for (const hash of ['esta', 'celular', 'outro-pc']) {
      await sessoes.criar({
        usuarioId: 'u-carlos',
        tokenHash: hash,
        criadaEm: AGORA,
        expiraEm: AGORA,
        expiraAbsolutoEm: AGORA,
        ip: '1.1.1.1',
        userAgent: hash,
      });
    }
    eu = {
      tipo: 'usuario',
      usuarioId: 'u-carlos',
      sessaoId: 's-1',
      nome: 'Carlos Andrade',
      email: 'carlos@empresa.com.br',
      papelId: 'p-admin',
      acessoTotal: true,
      permissoes: new Set(),
    };
  });

  it('mostra os dados da conta com o CPF mascarado e marca a sessão atual', async () => {
    const dados = await service.obter(eu);

    expect(dados).toMatchObject({
      nome: 'Carlos Andrade',
      email: 'carlos@empresa.com.br',
      cpfFinal: '41',
      papel: { nome: 'Administrador' },
      senhaAlteradaEm: null,
    });
    expect(dados.sessoesAbertas.map((s) => [s.userAgent, s.atual])).toEqual([
      ['esta', true],
      ['celular', false],
      ['outro-pc', false],
    ]);
  });

  it('atualiza o próprio nome e registra na auditoria', async () => {
    await service.atualizarNome(eu, '  Carlos A. Andrade ');

    expect(usuarios.porId('u-carlos').nome).toBe('Carlos A. Andrade');
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        acao: 'nome_alterado',
        antes: { nome: 'Carlos Andrade' },
        depois: { nome: 'Carlos A. Andrade' },
      }),
    ]);
  });

  describe('trocarSenha', () => {
    it('com a senha atual certa, grava a nova e encerra as outras sessões (não esta)', async () => {
      const resultado = await service.trocarSenha(eu, {
        senhaAtual: 'atual2026',
        novaSenha: 'nova2026',
      });

      expect(resultado).toEqual({ sessoesEncerradas: 2 });
      expect(usuarios.porId('u-carlos').senhaHash).toBe('hash:nova2026');
      expect(sessoes.sessoes.map((s) => s.encerradaEm)).toEqual([null, AGORA, AGORA]);
      expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'senha_trocada' });
    });

    it('recusa senha atual errada e senha nova fraca', async () => {
      await expect(
        service.trocarSenha(eu, { senhaAtual: 'errada123', novaSenha: 'nova2026' }),
      ).rejects.toThrow(SenhaAtualIncorretaError);
      await expect(
        service.trocarSenha(eu, { senhaAtual: 'atual2026', novaSenha: 'fraca' }),
      ).rejects.toThrow(SenhaFracaError);
      expect(usuarios.porId('u-carlos').senhaHash).toBe('hash:atual2026');
    });
  });

  it('encerra uma sessão própria ou todas as outras, mas nunca a de outra pessoa', async () => {
    await service.encerrarSessoes(eu, 's-2');
    expect(sessoes.porId('s-2').encerradaEm).toEqual(AGORA);

    await service.encerrarSessoes(eu);
    expect(sessoes.sessoes.map((s) => s.encerradaEm)).toEqual([null, AGORA, AGORA]);
  });

  it('lista os acessos dos últimos 30 dias, do mais novo para o mais antigo', async () => {
    const tentativa = (dias: number, sucesso: boolean) =>
      tentativas.registrar({
        ip: '1.1.1.1',
        usuarioId: 'u-carlos',
        sucesso,
        userAgent: 'Chrome',
        em: new Date(AGORA.getTime() - dias * DIA),
      });
    await tentativa(40, true);
    await tentativa(2, false);
    await tentativa(1, true);

    const acessos = await service.acessosRecentes(eu);

    expect(acessos.map((a) => a.sucesso)).toEqual([true, false]);
  });
});
