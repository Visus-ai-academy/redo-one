import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { DadosInvalidosError } from '../../domain/erros';
import { ConfiguracoesEmMemoria, EmpresasEmMemoria } from '../../testing/fakes';
import type { FiltroInadimplencia, Inadimplencia } from '../ports/configuracoes-financeiras';
import {
  ConsultarConfiguracoes,
  ConsultarInadimplencia,
  SalvarConfiguracao,
} from './configuracoes';

const relogio = { now: () => new Date('2026-11-27T15:00:00Z') };
const ator = { usuarioId: 'u1' };

describe('configurações financeiras', () => {
  let empresas: EmpresasEmMemoria;
  let configs: ConfiguracoesEmMemoria;
  let auditoria: InMemoryAuditoria;

  beforeEach(() => {
    empresas = new EmpresasEmMemoria([
      { id: 'tele', nome: '001 TELEIMAGEM', usaFinanceiro: true },
      { id: 'rn', nome: '002 RN', usaFinanceiro: false },
    ]);
    configs = new ConfiguracoesEmMemoria();
    auditoria = new InMemoryAuditoria();
  });

  it('lista cada empresa do financeiro com as faixas dela ou o padrão', async () => {
    expect(await new ConsultarConfiguracoes(empresas, configs).listar()).toEqual([
      {
        empresaId: 'tele',
        empresaNome: '001 TELEIMAGEM',
        faixasInadimplencia: [1, 6, 16, 31],
        padrao: true,
      },
    ]);
  });

  it('salva as faixas ordenadas e audita o que mudou; recusa empresa fora do financeiro', async () => {
    const salvar = new SalvarConfiguracao(empresas, configs, auditoria, relogio);
    await salvar.executar(ator, 'tele', { faixasInadimplencia: [1, 31, 11] });

    expect(await configs.buscar('tele')).toEqual({ faixasInadimplencia: [1, 11, 31] });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        entidade: 'configuracao_financeira',
        entidadeId: 'tele',
        acao: 'alterado',
        antes: { faixasInadimplencia: [1, 6, 16, 31] },
        depois: { faixasInadimplencia: [1, 11, 31] },
      }),
    ]);
    await expect(salvar.executar(ator, 'rn', { faixasInadimplencia: [1, 5] })).rejects.toThrow(
      DadosInvalidosError,
    );
  });

  it('a inadimplência põe cada cliente na faixa da empresa dele e lista as faixas para o filtro', async () => {
    await configs.salvar('tele', { faixasInadimplencia: [1, 11, 31] }, 'u1');
    let recebido: FiltroInadimplencia | undefined;
    const fonte: Inadimplencia = {
      listar: async (filtro) => {
        recebido = filtro;
        return {
          itens: [
            {
              clienteId: 'c1',
              clienteNome: 'HCLONDRINA',
              contratadoId: 'tele',
              empresaNome: '001 TELEIMAGEM',
              titulos: 2,
              maisAntigo: '2026-10-10',
              diasDeAtraso: 48,
              faixas: [1, 11, 31],
              totalVencidoCentavos: 2_530_000,
            },
          ],
          total: 1,
          totalVencidoCentavos: 2_530_000,
        };
      },
    };
    const consultar = new ConsultarInadimplencia(fonte, empresas, configs, relogio);
    const pagina = await consultar.listar({
      empresa: 'todas',
      faixa: 'todas',
      pagina: 1,
      porPagina: 25,
    });

    expect(recebido).toMatchObject({ hoje: '2026-11-27', faixasPadrao: [1, 6, 16, 31] });
    expect(pagina.itens[0]?.faixa).toEqual({
      inicio: 31,
      rotulo: 'Mais de 30 dias',
      indice: 2,
      de: 3,
    });
    expect(pagina.faixas).toEqual([
      { inicio: 1, rotulo: '1–10 dias' },
      { inicio: 11, rotulo: '11–30 dias' },
      { inicio: 31, rotulo: 'Mais de 30 dias' },
    ]);
  });
});
