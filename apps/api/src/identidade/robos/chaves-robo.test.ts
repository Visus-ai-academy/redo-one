import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import type { PrincipalUsuario } from '../principal';
import { hashDoToken } from '../sessoes/abrir-sessao';
import { FixedClock, InMemoryChavesRoboRepository } from '../testing/fakes';
import { ChaveRoboAutenticador } from './chave-robo-autenticador';
import { ChaveRoboNaoEncontradaError, PermissaoDeRoboInvalidaError } from './chaves-robo.errors';
import { ChavesRoboService } from './chaves-robo.service';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-13T12:00:00Z');
const admin = { usuarioId: 'u-admin', acessoTotal: true } as PrincipalUsuario;
const importacao = {
  nome: 'Importação de laudos',
  descricao: 'Traz os laudos da MobileMed',
  permissoes: ['ingestao.laudos.importar', 'ingestao.fila.importar'],
};

describe('ChavesRoboService', () => {
  let chaves: InMemoryChavesRoboRepository;
  let auditoria: InMemoryAuditoria;
  let relogio: FixedClock;
  let service: ChavesRoboService;

  beforeEach(() => {
    chaves = new InMemoryChavesRoboRepository();
    auditoria = new InMemoryAuditoria();
    relogio = new FixedClock(AGORA);
    service = new ChavesRoboService(chaves, auditoria, relogio);
  });

  it('cria a chave, devolve ela inteira uma vez e guarda só o prefixo e o hash', async () => {
    const { id, chave } = await service.criar(admin, { ...importacao, validadeDias: 365 });

    expect(chave).toMatch(/^one_[\w-]{40,}$/);
    expect(chaves.porId(id)).toMatchObject({
      nome: 'Importação de laudos',
      prefixo: chave.slice(0, 12),
      tokenHash: hashDoToken(chave),
      expiraEm: new Date(AGORA.getTime() + 365 * DIA),
      criadaPorId: 'u-admin',
    });
    expect(JSON.stringify(auditoria.eventos)).not.toContain(chave);
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({ entidade: 'chave_robo', entidadeId: id, acao: 'criada' }),
    ]);
  });

  it('sem validade, a chave não expira', async () => {
    const { id } = await service.criar(admin, { ...importacao, validadeDias: null });

    expect(chaves.porId(id).expiraEm).toBeNull();
  });

  it('recusa permissão que não é de robô (robô não abre tela)', async () => {
    await expect(
      service.criar(admin, { ...importacao, permissoes: ['usuarios.ver'], validadeDias: 365 }),
    ).rejects.toThrow(PermissaoDeRoboInvalidaError);
  });

  it('gerar chave nova cria outra ativa para o mesmo robô; a antiga vale até ser revogada', async () => {
    const antiga = await service.criar(admin, { ...importacao, validadeDias: 365 });

    const nova = await service.gerarNova(admin, antiga.id);

    expect(nova.chave).not.toBe(antiga.chave);
    expect(chaves.porId(nova.id)).toMatchObject({
      nome: importacao.nome,
      permissoes: [...importacao.permissoes].sort(),
    });
    expect(chaves.porId(antiga.id).revogadaEm).toBeNull();
  });

  it('revoga e registra quem revogou; chave inexistente dá erro', async () => {
    const { id } = await service.criar(admin, { ...importacao, validadeDias: 365 });

    await service.revogar(admin, id);

    expect(chaves.porId(id).revogadaEm).toEqual(AGORA);
    expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'revogada', entidadeId: id });
    await expect(service.revogar(admin, 'k-nada')).rejects.toThrow(ChaveRoboNaoEncontradaError);
  });
});

describe('ChaveRoboAutenticador', () => {
  let chaves: InMemoryChavesRoboRepository;
  let relogio: FixedClock;
  let autenticador: ChaveRoboAutenticador;
  let chave: string;
  let id: string;

  beforeEach(async () => {
    chaves = new InMemoryChavesRoboRepository();
    relogio = new FixedClock(AGORA);
    const service = new ChavesRoboService(chaves, new InMemoryAuditoria(), relogio);
    ({ id, chave } = await service.criar(admin, { ...importacao, validadeDias: 365 }));
    autenticador = new ChaveRoboAutenticador(chaves, relogio);
  });

  it('chave válida vira o robô com as permissões dela e registra o uso', async () => {
    const principal = await autenticador.autenticar(chave, '10.0.4.12');

    expect(principal).toMatchObject({ tipo: 'robo', chaveId: id, nome: 'Importação de laudos' });
    expect([...(principal?.permissoes ?? [])]).toEqual([...importacao.permissoes].sort());
    expect(chaves.porId(id)).toMatchObject({ ultimoUsoEm: AGORA, ultimoIp: '10.0.4.12' });
  });

  it('recusa chave desconhecida, revogada ou vencida', async () => {
    await expect(autenticador.autenticar('one_inventada', '1.1.1.1')).resolves.toBeNull();

    relogio.avancar(366 * DIA);
    await expect(autenticador.autenticar(chave, '1.1.1.1')).resolves.toBeNull();

    relogio.avancar(-366 * DIA);
    await chaves.revogar(id, AGORA);
    await expect(autenticador.autenticar(chave, '1.1.1.1')).resolves.toBeNull();
  });

  it('usos em menos de 1 minuto não regravam o último uso', async () => {
    await autenticador.autenticar(chave, '1.1.1.1');
    relogio.avancar(10_000);
    await autenticador.autenticar(chave, '1.1.1.1');

    expect(chaves.usosRegistrados).toBe(1);
  });
});
