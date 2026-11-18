import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { CONFIGURACAO_INICIAL, type ConfiguracaoGlobal } from '../../domain/configuracao-global';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import { CadastrosEmMemoria, ConfiguracaoEmMemoria } from '../../testing/fakes';
import { DefinirConfiguracaoGlobal, ObterConfiguracaoGlobal } from './configuracao-global';

const agora = new Date('2026-11-17T18:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };

const producao = (parcial: Partial<ConfiguracaoGlobal> = {}): ConfiguracaoGlobal => ({
  ...CONFIGURACAO_INICIAL,
  marcadoresEquilibrio: ['ONCO'],
  turnosPosteriores: { turnoIds: ['tarde'], cheiaEm: '10:50' },
  ...parcial,
});

describe('configuração global da distribuição', () => {
  let repo: ConfiguracaoEmMemoria;
  let cadastros: CadastrosEmMemoria;
  let auditoria: InMemoryAuditoria;
  let obter: ObterConfiguracaoGlobal;
  let definir: DefinirConfiguracaoGlobal;

  beforeEach(() => {
    repo = new ConfiguracaoEmMemoria();
    cadastros = new CadastrosEmMemoria();
    cadastros.existentes.set('prioridade', new Set(['urg', 'rot']));
    cadastros.existentes.set('turno', new Set(['tarde', 'noite']));
    auditoria = new InMemoryAuditoria();
    obter = new ObterConfiguracaoGlobal(repo);
    definir = new DefinirConfiguracaoGlobal(repo, cadastros, auditoria, () => agora);
  });

  it('sem nada salvo, devolve a inicial', async () => {
    expect(await obter.executar()).toEqual(CONFIGURACAO_INICIAL);
  });

  it('salva e audita só os campos que mudaram', async () => {
    await definir.executar(ator, producao());
    expect(await obter.executar()).toEqual(producao());
    await definir.executar(ator, producao({ cicloMinutos: 20 }));

    expect(auditoria.eventos).toHaveLength(2);
    expect(auditoria.eventos[0]).toMatchObject({
      entidade: 'configuracao_distribuicao',
      entidadeId: 'global',
      acao: 'alterado',
      ator,
      em: agora,
    });
    expect(auditoria.eventos[1]).toMatchObject({
      antes: { cicloMinutos: 30 },
      depois: { cicloMinutos: 20 },
    });
  });

  it('nada mudou (mesmas listas em outra ordem): não grava nem audita', async () => {
    const posteriores = (turnoIds: string[]) => ({ turnoIds, cheiaEm: '10:50' });
    await definir.executar(ator, producao({ turnosPosteriores: posteriores(['tarde', 'noite']) }));
    const gravacoes = repo.gravacoes;
    await definir.executar(ator, producao({ turnosPosteriores: posteriores(['noite', 'tarde']) }));
    expect(repo.gravacoes).toBe(gravacoes);
    expect(auditoria.eventos).toHaveLength(1);
  });

  it('sem os campos do robô no pedido, mantém os gravados (a tela antiga não os manda)', async () => {
    await definir.executar(ator, producao({ roboAtivo: false, tetoPorRodada: 300 }));
    const {
      roboAtivo: _,
      expiracaoPropostaMin: __,
      tetoPorRodada: ___,
      ...semRobo
    } = producao({
      cicloMinutos: 20,
    });
    await definir.executar(ator, semRobo);
    expect(await obter.executar()).toMatchObject({
      roboAtivo: false,
      tetoPorRodada: 300,
      expiracaoPropostaMin: 45,
      cicloMinutos: 20,
    });
  });

  it('apara os marcadores antes de gravar', async () => {
    await definir.executar(ator, producao({ marcadoresEquilibrio: [' ONCO '] }));
    expect((await obter.executar()).marcadoresEquilibrio).toEqual(['ONCO']);
  });

  it('recusa configuração inválida sem gravar', async () => {
    await expect(definir.executar(ator, producao({ cicloMinutos: 0 }))).rejects.toBeInstanceOf(
      ConfiguracaoInvalidaError,
    );
    expect(repo.gravacoes).toBe(0);
  });

  it('recusa turno que não existe', async () => {
    await expect(
      definir.executar(
        ator,
        producao({ turnosPosteriores: { turnoIds: ['x'], cheiaEm: '10:50' } }),
      ),
    ).rejects.toThrow(/turno não encontrado/i);
    expect(repo.gravacoes).toBe(0);
  });
});
