import { beforeEach, describe, expect, it } from 'vitest';

import { CompetenciasEmMemoria, CortesEmMemoria } from '../../../faturamento/testing/fakes';
import type { LaudoPreparado } from '../../domain/preparar-laudo';
import { LaudosEmMemoria } from '../../testing/fakes';
import { RecalcularCompetencias } from './recalcular-competencias';

const agora = new Date('2026-11-24T12:00:00Z');

/** Exame em 05/10 e laudo em 20/10 (Brasília): pelo padrão, 2026-10. */
const laudo = (identidade: string, clienteId: string | null): LaudoPreparado =>
  ({
    identidade,
    clienteId,
    dataRealizacao: new Date('2026-10-05T11:00:00Z'),
    dataLaudo: new Date('2026-10-20T17:00:00Z'),
    competencia: '2026-10',
  }) as LaudoPreparado;

/** Até o dia 15, no próprio mês, sem olhar o exame: o laudo do dia 20 vai para 2026-11. */
const corteDia15 = { dia: 15, mes: 'proprio', consideraExame: false } as const;

describe('RecalcularCompetencias', () => {
  let laudos: LaudosEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let cortes: CortesEmMemoria;
  let recalcular: RecalcularCompetencias;

  const guardar = (...lista: LaudoPreparado[]) => {
    for (const l of lista) {
      laudos.laudos.set(l.identidade, { ...l, removido: false, importacaoId: 'i' });
    }
  };
  const competenciaDe = (identidade: string) => laudos.laudos.get(identidade)?.competencia;

  beforeEach(() => {
    laudos = new LaudosEmMemoria();
    competencias = new CompetenciasEmMemoria();
    cortes = new CortesEmMemoria();
    recalcular = new RecalcularCompetencias(laudos, competencias, cortes, () => agora);
    guardar(laudo('x1', 'c-x'), laudo('y1', 'c-y'), laudo('s1', null));
  });

  it('com o corte do cliente mudado, só os laudos dele mudam de competência', async () => {
    cortes.porCliente.set('c-x', [{ desde: '2026-10', corte: corteDia15 }]);

    const resultado = await recalcular.executar({ clienteIds: ['c-x'] });

    expect(resultado).toEqual({ lidos: 1, alterados: 1 });
    expect(competenciaDe('x1')).toBe('2026-11');
    expect(competenciaDe('y1')).toBe('2026-10');
    expect(competenciaDe('s1')).toBe('2026-10');
    expect(competencias.competencias.get('2026-11')).toEqual({
      status: 'aberta',
      importacaoTravada: false,
    });
  });

  it('sem clientes (corte padrão), passa por todos os laudos, inclusive os sem cliente', async () => {
    cortes.padrao.push(
      { desde: '2000-01', corte: { dia: 7, mes: 'seguinte', consideraExame: true } },
      { desde: '2026-10', corte: corteDia15 },
    );

    const resultado = await recalcular.executar({ clienteIds: null });

    expect(resultado).toEqual({ lidos: 3, alterados: 3 });
    expect(['x1', 'y1', 's1'].map(competenciaDe)).toEqual(['2026-11', '2026-11', '2026-11']);
  });

  it('lê as competências bloqueadas na hora de rodar: a fechada depois de enfileirar não muda', async () => {
    cortes.porCliente.set('c-x', [{ desde: '2026-10', corte: corteDia15 }]);
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });

    const resultado = await recalcular.executar({ clienteIds: ['c-x'] });

    expect(resultado).toEqual({ lidos: 0, alterados: 0 });
    expect(competenciaDe('x1')).toBe('2026-10');
  });

  it('não leva laudo para competência bloqueada', async () => {
    cortes.porCliente.set('c-x', [{ desde: '2026-10', corte: corteDia15 }]);
    competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: true });

    const resultado = await recalcular.executar({ clienteIds: ['c-x'] });

    expect(resultado).toEqual({ lidos: 1, alterados: 0 });
    expect(competenciaDe('x1')).toBe('2026-10');
  });

  it('descarta o laudo cuja competência de origem foi bloqueada entre ler o lote e filtrar', async () => {
    cortes.porCliente.set('c-x', [{ desde: '2026-10', corte: corteDia15 }]);
    const ler = laudos.lerParaRecalculo.bind(laudos);
    laudos.lerParaRecalculo = async (lote) => {
      const lidos = await ler(lote);
      // Fecham 2026-10 logo depois da leitura: o lote já traz x1, de 2026-10.
      competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
      return lidos;
    };

    const resultado = await recalcular.executar({ clienteIds: ['c-x'] });

    expect(resultado).toEqual({ lidos: 1, alterados: 0 });
    expect(competenciaDe('x1')).toBe('2026-10');
    expect(competencias.competencias.has('2026-11')).toBe(false);
  });

  it('rodar duas vezes não muda nada na segunda', async () => {
    cortes.porCliente.set('c-x', [{ desde: '2026-10', corte: corteDia15 }]);

    await recalcular.executar({ clienteIds: ['c-x'] });
    const segunda = await recalcular.executar({ clienteIds: ['c-x'] });

    expect(segunda).toEqual({ lidos: 1, alterados: 0 });
    expect(competenciaDe('x1')).toBe('2026-11');
  });

  it('percorre os laudos em lotes de 5.000', async () => {
    guardar(
      ...Array.from({ length: 5000 }, (_, i) => laudo(`x${String(i).padStart(5, '0')}`, 'c-x')),
    );
    cortes.porCliente.set('c-x', [{ desde: '2026-10', corte: corteDia15 }]);

    const resultado = await recalcular.executar({ clienteIds: ['c-x'] });

    expect(resultado).toEqual({ lidos: 5001, alterados: 5001 });
    expect(laudos.lotesLidos).toBe(2);
  });

  describe('entre um lote e outro', () => {
    /** Lote 1: 5.000 laudos de 2026-10 que vão para 2026-11; lote 2 vem depois deles. */
    const loteCheio = () =>
      guardar(
        ...Array.from({ length: 5000 }, (_, i) => laudo(`x${String(i).padStart(5, '0')}`, 'c-x')),
      );

    beforeEach(() => {
      laudos.laudos.clear();
      cortes.porCliente.set('c-x', [{ desde: '2026-10', corte: corteDia15 }]);
    });

    it('a competência nova do lote gravado tem linha mesmo se o job cair no lote seguinte', async () => {
      loteCheio();
      // Lote 2: laudo de 20/11 que vai para 2026-12.
      guardar({
        ...laudo('z1', 'c-x'),
        dataLaudo: new Date('2026-11-20T17:00:00Z'),
        competencia: '2026-11',
      });
      const gravar = laudos.atualizarCompetencias.bind(laudos);
      let chamadas = 0;
      laudos.atualizarCompetencias = async (mudancas) => {
        chamadas++;
        if (chamadas === 2) throw new Error('caiu no 2º lote');
        return gravar(mudancas);
      };

      await expect(recalcular.executar({ clienteIds: ['c-x'] })).rejects.toThrow('caiu');
      const retentativa = await recalcular.executar({ clienteIds: ['c-x'] });

      expect(retentativa).toEqual({ lidos: 5001, alterados: 1 });
      expect(competenciaDe('x00000')).toBe('2026-11');
      expect(competenciaDe('z1')).toBe('2026-12');
      expect([...competencias.competencias.keys()].sort()).toEqual(['2026-11', '2026-12']);
    });

    it('relê as bloqueadas: a competência fechada durante a execução não muda nem recebe laudos', async () => {
      loteCheio();
      // Lote 2: um laudo que sai de 2026-10 e um que iria para 2026-11.
      guardar(laudo('z1', 'c-x'), { ...laudo('z2', 'c-x'), competencia: '2026-12' });
      const gravar = laudos.atualizarCompetencias.bind(laudos);
      laudos.atualizarCompetencias = async (mudancas) => {
        await gravar(mudancas);
        // Fecham 2026-10 e 2026-11 logo depois do 1º lote.
        competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
        competencias.competencias.set('2026-11', { status: 'fechada', importacaoTravada: false });
      };

      const resultado = await recalcular.executar({ clienteIds: ['c-x'] });

      expect(resultado.alterados).toBe(5000);
      expect(competenciaDe('x04999')).toBe('2026-11');
      expect(competenciaDe('z1')).toBe('2026-10');
      expect(competenciaDe('z2')).toBe('2026-12');
    });
  });
});
