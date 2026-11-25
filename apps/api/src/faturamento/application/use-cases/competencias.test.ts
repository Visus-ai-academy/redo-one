import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import {
  CompetenciaComAvisosError,
  CompetenciaEmAndamentoError,
  CompetenciaJaAbertaError,
  CompetenciaJaFechadaError,
  CompetenciaNaoEncontradaError,
  FecharComAvisosProibidoError,
  ImportacaoJaTravadaError,
  ImportacaoNaoTravadaError,
} from '../../domain/competencia-status';
import { CompetenciaInvalidaError } from '../../domain/vigencia-corte';
import { CompetenciasEmMemoria } from '../../testing/fakes';
import type { AvisosDoFechamento } from '../ports/avisos-do-fechamento';
import { FecharCompetencia } from './fechar-competencia';
import { ListarCompetencias } from './listar-competencias';
import { ReabrirCompetencia } from './reabrir-competencia';
import { DestravarImportacao, TravarImportacao } from './travar-importacao';

// 24/11/2026 12:00 em Brasília: outubro já acabou, novembro não.
const agora = new Date('2026-11-24T15:00:00Z');
const autor = { usuarioId: 'u1', em: agora };
const ator = { tipo: 'usuario' as const, id: 'u1' };

describe('competências', () => {
  let competencias: CompetenciasEmMemoria;
  let auditoria: InMemoryAuditoria;

  beforeEach(() => {
    competencias = new CompetenciasEmMemoria();
    auditoria = new InMemoryAuditoria();
    competencias.competencias.set('2026-09', { status: 'fechada', importacaoTravada: false });
    competencias.competencias.set('2026-10', { status: 'aberta', importacaoTravada: false });
    competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: false });
  });

  it('lista a página da mais nova para a mais antiga', async () => {
    const pagina = await new ListarCompetencias(competencias).executar({ pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((c) => c.competencia)).toEqual(['2026-11', '2026-10']);
  });

  describe('fechar', () => {
    /** Avisos pendentes que impedem fechar, por competência. */
    let pendentes: Record<
      string,
      { id: string; tipo: 'cliente' | 'preco_repetido'; valor: string }[]
    >;
    const avisos: AvisosDoFechamento = {
      queImpedem: async (competencia, limite) => {
        const lista = pendentes[competencia] ?? [];
        return { total: lista.length, itens: lista.slice(0, limite) };
      },
    };
    const fechar = () => new FecharCompetencia(competencias, avisos, auditoria, () => agora);
    beforeEach(() => {
      pendentes = {};
    });

    it('fecha a aberta cujo mês já acabou, com autor e auditoria', async () => {
      await fechar().executar('u1', '2026-10');

      expect(competencias.competencias.get('2026-10')?.status).toBe('fechada');
      expect(competencias.acoes).toEqual([{ acao: 'fechar', competencia: '2026-10', autor }]);
      expect(auditoria.eventos).toEqual([
        {
          ator,
          entidade: 'competencia',
          entidadeId: '2026-10',
          acao: 'fechada',
          antes: { status: 'aberta' },
          depois: { status: 'fechada' },
          em: agora,
        },
      ]);
    });

    it('recusa o mês que ainda não acabou em Brasília', async () => {
      await expect(fechar().executar('u1', '2026-11')).rejects.toThrow(CompetenciaEmAndamentoError);
      // 30/11 23:59 em Brasília (01/12 02:59 UTC): novembro ainda não acabou.
      const quase = new FecharCompetencia(
        competencias,
        avisos,
        auditoria,
        () => new Date('2026-12-01T02:59:00Z'),
      );
      await expect(quase.executar('u1', '2026-11')).rejects.toThrow(CompetenciaEmAndamentoError);
      expect(auditoria.eventos).toEqual([]);
    });

    it('recusa a já fechada', async () => {
      await expect(fechar().executar('u1', '2026-09')).rejects.toThrow(CompetenciaJaFechadaError);
    });

    it('recusa a competência sem linha', async () => {
      await expect(fechar().executar('u1', '2026-08')).rejects.toThrow(
        CompetenciaNaoEncontradaError,
      );
    });

    it('recusa competência fora do formato AAAA-MM', async () => {
      await expect(fechar().executar('u1', '2026-13')).rejects.toThrow(CompetenciaInvalidaError);
    });

    it('recusa se outra requisição fechou antes de gravar', async () => {
      competencias.fechar = async () => false;
      await expect(fechar().executar('u1', '2026-10')).rejects.toThrow(CompetenciaJaFechadaError);
      expect(auditoria.eventos).toEqual([]);
    });

    describe('com avisos que impedem fechar', () => {
      beforeEach(() => {
        pendentes['2026-10'] = [
          { id: 'a1', tipo: 'cliente', valor: 'CLINICA NOVA' },
          { id: 'a2', tipo: 'preco_repetido', valor: 'CLINICA X | CT' },
        ];
      });

      it('recusa listando os avisos e se quem pede pode fechar mesmo assim', async () => {
        const erro = await fechar()
          .executar('u1', '2026-10')
          .catch((e: unknown) => e);

        expect(erro).toBeInstanceOf(CompetenciaComAvisosError);
        expect((erro as CompetenciaComAvisosError).detalhes).toEqual({
          codigo: 'avisos_pendentes',
          avisos: { total: 2, itens: pendentes['2026-10'] },
          podeFecharComAvisos: false,
        });
        expect(competencias.competencias.get('2026-10')?.status).toBe('aberta');
        expect(auditoria.eventos).toEqual([]);
      });

      it('com a permissão mas sem motivo, recusa (e diz que pode)', async () => {
        const erro = await fechar()
          .executar('u1', '2026-10', { podeFecharComAvisos: true, motivoAvisos: '   ' })
          .catch((e: unknown) => e);
        expect((erro as CompetenciaComAvisosError).detalhes).toMatchObject({
          podeFecharComAvisos: true,
        });
      });

      it('motivo sem a permissão é proibido', async () => {
        await expect(
          fechar().executar('u1', '2026-10', { motivoAvisos: 'Fatura urgente.' }),
        ).rejects.toThrow(FecharComAvisosProibidoError);
      });

      it('com a permissão e o motivo, fecha e guarda o motivo no fechamento e na auditoria', async () => {
        await fechar().executar('u1', '2026-10', {
          podeFecharComAvisos: true,
          motivoAvisos: '  Cliente novo cadastrado amanhã; fatura não espera.  ',
        });

        expect(competencias.competencias.get('2026-10')?.status).toBe('fechada');
        expect(competencias.acoes).toEqual([
          {
            acao: 'fechar',
            competencia: '2026-10',
            autor,
            motivoAvisos: 'Cliente novo cadastrado amanhã; fatura não espera.',
          },
        ]);
        expect(auditoria.eventos).toEqual([
          expect.objectContaining({
            acao: 'fechada',
            depois: {
              status: 'fechada',
              comAvisos: {
                motivo: 'Cliente novo cadastrado amanhã; fatura não espera.',
                total: 2,
                avisos: ['a1', 'a2'],
              },
            },
          }),
        ]);
      });

      it('aviso de outra competência não impede', async () => {
        pendentes = { '2026-09': pendentes['2026-10'] ?? [] };
        await fechar().executar('u1', '2026-10');
        expect(competencias.competencias.get('2026-10')?.status).toBe('fechada');
      });
    });
  });

  describe('reabrir', () => {
    const reabrir = () => new ReabrirCompetencia(competencias, auditoria, () => agora);

    it('reabre a fechada sem mexer na trava da importação', async () => {
      competencias.competencias.set('2026-09', { status: 'fechada', importacaoTravada: true });

      await reabrir().executar('u1', '2026-09');

      expect(competencias.competencias.get('2026-09')).toEqual({
        status: 'aberta',
        importacaoTravada: true,
      });
      expect(competencias.acoes).toEqual([{ acao: 'reabrir', competencia: '2026-09', autor }]);
      expect(auditoria.eventos).toEqual([
        {
          ator,
          entidade: 'competencia',
          entidadeId: '2026-09',
          acao: 'reaberta',
          antes: { status: 'fechada' },
          depois: { status: 'aberta' },
          em: agora,
        },
      ]);
    });

    it('recusa a aberta e a sem linha', async () => {
      await expect(reabrir().executar('u1', '2026-10')).rejects.toThrow(CompetenciaJaAbertaError);
      await expect(reabrir().executar('u1', '2026-08')).rejects.toThrow(
        CompetenciaNaoEncontradaError,
      );
      await expect(reabrir().executar('u1', '2026-1')).rejects.toThrow(CompetenciaInvalidaError);
    });

    it('recusa se outra requisição reabriu antes de gravar', async () => {
      competencias.reabrir = async () => false;
      await expect(reabrir().executar('u1', '2026-09')).rejects.toThrow(CompetenciaJaAbertaError);
    });
  });

  describe('travar e destravar a importação', () => {
    const travar = () => new TravarImportacao(competencias, auditoria, () => agora);
    const destravar = () => new DestravarImportacao(competencias, auditoria, () => agora);

    it('trava a aberta (inclusive a do mês corrente) e a importação passa a ignorá-la', async () => {
      await travar().executar('u1', '2026-11');

      expect(await competencias.listar()).toContain('2026-11');
      expect(competencias.acoes).toEqual([{ acao: 'travar', competencia: '2026-11', autor }]);
      expect(auditoria.eventos).toEqual([
        {
          ator,
          entidade: 'competencia',
          entidadeId: '2026-11',
          acao: 'importacao_travada',
          antes: { importacaoTravada: false },
          depois: { importacaoTravada: true },
          em: agora,
        },
      ]);
    });

    it('destrava a travada', async () => {
      competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: true });

      await destravar().executar('u1', '2026-11');

      expect(await competencias.listar()).not.toContain('2026-11');
      expect(competencias.acoes).toEqual([{ acao: 'destravar', competencia: '2026-11' }]);
      expect(auditoria.eventos).toEqual([
        {
          ator,
          entidade: 'competencia',
          entidadeId: '2026-11',
          acao: 'importacao_destravada',
          antes: { importacaoTravada: true },
          depois: { importacaoTravada: false },
          em: agora,
        },
      ]);
    });

    it('recusa travar a travada e destravar a que não está travada', async () => {
      competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: true });
      await expect(travar().executar('u1', '2026-11')).rejects.toThrow(ImportacaoJaTravadaError);
      await expect(destravar().executar('u1', '2026-10')).rejects.toThrow(
        ImportacaoNaoTravadaError,
      );
    });

    it('recusa se outra requisição mudou a trava antes de gravar', async () => {
      competencias.travarImportacao = async () => false;
      competencias.destravarImportacao = async () => false;
      competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: true });
      await expect(travar().executar('u1', '2026-10')).rejects.toThrow(ImportacaoJaTravadaError);
      await expect(destravar().executar('u1', '2026-11')).rejects.toThrow(
        ImportacaoNaoTravadaError,
      );
    });

    it('recusa a sem linha', async () => {
      await expect(travar().executar('u1', '2026-08')).rejects.toThrow(
        CompetenciaNaoEncontradaError,
      );
      await expect(destravar().executar('u1', '2026-08')).rejects.toThrow(
        CompetenciaNaoEncontradaError,
      );
    });
  });
});
