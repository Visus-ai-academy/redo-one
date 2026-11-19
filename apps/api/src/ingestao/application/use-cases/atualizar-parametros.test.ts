import { describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { ParametrosInvalidosError } from '../erros';
import type { ParametrosIngestao } from '../ports/parametros-ingestao.repository';
import { AtualizarParametros } from './atualizar-parametros';

const agora = new Date('2026-11-16T12:00:00Z');
const padrao: ParametrosIngestao = {
  travaRemocaoMinimo: 500,
  travaRemocaoFator: 2,
  retencaoLinhasBrutasDias: 90,
  mobilemedIntervaloMinutos: 30,
  mobilemedMesesAnteriores: 1,
  mobilemedJanelaDias: 7,
  mobilemedTeto: 50_000,
  mobilemedCompartilhamentoUnidades: ['CRD_APOIO'],
};

function montar() {
  let gravado = { ...padrao };
  const auditoria = new InMemoryAuditoria();
  const atualizar = new AtualizarParametros(
    {
      obter: async () => gravado,
      salvar: async (p) => {
        gravado = p;
      },
    },
    auditoria,
    () => agora,
  );
  return { atualizar, auditoria, gravado: () => gravado };
}

describe('AtualizarParametros', () => {
  it('salva e audita só o que mudou', async () => {
    const { atualizar, auditoria, gravado } = montar();

    await atualizar.executar('u1', { ...padrao, retencaoLinhasBrutasDias: 30 });

    expect(gravado().retencaoLinhasBrutasDias).toBe(30);
    expect(auditoria.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'parametros_ingestao',
        entidadeId: '1',
        acao: 'alterado',
        antes: { retencaoLinhasBrutasDias: 90 },
        depois: { retencaoLinhasBrutasDias: 30 },
        em: agora,
      },
    ]);
  });

  it('o intervalo vazio desliga a importação automática (e é auditado)', async () => {
    const { atualizar, auditoria, gravado } = montar();

    await atualizar.executar('u1', { ...padrao, mobilemedIntervaloMinutos: null });

    expect(gravado().mobilemedIntervaloMinutos).toBeNull();
    expect(auditoria.eventos[0]).toMatchObject({
      antes: { mobilemedIntervaloMinutos: 30 },
      depois: { mobilemedIntervaloMinutos: null },
    });
  });

  it('as unidades do compartilhamento: aparadas, sem repetir, e auditadas só se mudaram', async () => {
    const { atualizar, auditoria, gravado } = montar();

    await atualizar.executar('u1', { ...padrao, mobilemedCompartilhamentoUnidades: ['CRD_APOIO'] });
    expect(auditoria.eventos).toEqual([]);

    await atualizar.executar('u1', {
      ...padrao,
      mobilemedCompartilhamentoUnidades: [' CRD_APOIO ', 'OUTRA', 'OUTRA'],
    });
    expect(gravado().mobilemedCompartilhamentoUnidades).toEqual(['CRD_APOIO', 'OUTRA']);
    expect(auditoria.eventos[0]).toMatchObject({
      antes: { mobilemedCompartilhamentoUnidades: ['CRD_APOIO'] },
      depois: { mobilemedCompartilhamentoUnidades: ['CRD_APOIO', 'OUTRA'] },
    });
  });

  it('sem mudança, não audita', async () => {
    const { atualizar, auditoria } = montar();
    await atualizar.executar('u1', padrao);
    expect(auditoria.eventos).toEqual([]);
  });

  it.each([
    [{ travaRemocaoMinimo: -1 }, 'O mínimo da trava não pode ser negativo.'],
    [{ travaRemocaoFator: 0 }, 'O múltiplo da trava precisa ser maior que zero.'],
    [{ retencaoLinhasBrutasDias: 0 }, 'A retenção precisa ficar entre 1 e 3650 dias.'],
    [{ retencaoLinhasBrutasDias: 4000 }, 'A retenção precisa ficar entre 1 e 3650 dias.'],
    [{ mobilemedIntervaloMinutos: 4 }, 'O intervalo precisa ficar entre 5 e 1440 minutos.'],
    [{ mobilemedMesesAnteriores: 13 }, 'Os meses anteriores precisam ficar entre 0 e 12.'],
    [{ mobilemedJanelaDias: 0 }, 'A janela precisa ficar entre 1 e 31 dias.'],
    [{ mobilemedTeto: 0 }, 'O teto precisa ser um inteiro a partir de 1.'],
    [{ mobilemedCompartilhamentoUnidades: [''] }, 'Informe o nome de cada unidade.'],
  ])('recusa %o', async (mudanca, mensagem) => {
    const { atualizar, gravado } = montar();
    await expect(atualizar.executar('u1', { ...padrao, ...mudanca })).rejects.toThrow(
      new ParametrosInvalidosError(mensagem),
    );
    expect(gravado()).toEqual(padrao);
  });
});
