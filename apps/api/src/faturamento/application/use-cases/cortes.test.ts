import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { CORTE_PADRAO_INICIAL } from '../../../ingestao/domain/competencia';
import {
  ClienteNaoEncontradoError,
  CompetenciaInvalidaError,
  VigenciaInvalidaError,
  VigenciaRepetidaError,
} from '../../domain/vigencia-corte';
import {
  CompetenciasEmMemoria,
  CortesEmMemoria,
  LaudosCompetenciaEmMemoria,
} from '../../testing/fakes';
import { CriarCorte } from './criar-corte';
import { ListarCortes } from './listar-cortes';
import { PreviaCorte } from './previa-corte';

const agora = new Date('2026-11-24T15:00:00Z');

/** Dia 25 no próprio mês, só pela data do laudo (o SROSALIA). */
const dia25 = {
  usaPadrao: false,
  dia: 25,
  ultimoDia: false,
  mes: 'proprio' as const,
  consideraExame: false,
};

/** Exame feito em 01/10/2026; a competência gravada é a do corte padrão. */
const laudo = (id: string, clienteId: string | null, dataLaudo: string, competencia: string) => ({
  id,
  clienteId,
  dataRealizacao: new Date('2026-10-01T15:00:00Z'),
  dataLaudo: new Date(dataLaudo),
  competencia,
});

describe('cortes', () => {
  let cortes: CortesEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let laudos: LaudosCompetenciaEmMemoria;
  let auditoria: InMemoryAuditoria;
  let criar: CriarCorte;
  let previa: PreviaCorte;

  beforeEach(async () => {
    cortes = new CortesEmMemoria();
    await cortes.garantirPadraoInicial();
    cortes.clientes.add('c1');
    cortes.clientes.add('c2');
    competencias = new CompetenciasEmMemoria();
    competencias.competencias.set('2026-09', { status: 'fechada', importacaoTravada: false });
    competencias.competencias.set('2026-10', { status: 'aberta', importacaoTravada: false });
    competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: false });
    laudos = new LaudosCompetenciaEmMemoria();
    auditoria = new InMemoryAuditoria();
    criar = new CriarCorte(cortes, competencias, auditoria, () => agora);
    previa = new PreviaCorte(cortes, competencias, laudos);
  });

  describe('listar', () => {
    it('as vigências do padrão (sem cliente) ou do cliente, a mais nova primeiro', async () => {
      cortes.porCliente.set('c1', [
        { desde: '2026-10', corte: null },
        { desde: '2026-11', corte: { dia: 25, mes: 'proprio', consideraExame: false } },
      ]);
      const listar = new ListarCortes(cortes);

      expect((await listar.executar(null)).map((v) => v.desde)).toEqual(['2000-01']);
      expect((await listar.executar('c1')).map((v) => [v.desde, v.corte])).toEqual([
        ['2026-11', { dia: 25, mes: 'proprio', consideraExame: false }],
        ['2026-10', null],
      ]);
    });
  });

  describe('criar', () => {
    it('grava a vigência do cliente, enfileira o recálculo dele e audita', async () => {
      const id = await criar.executar('u1', { clienteId: 'c1', desde: '2026-10', ...dia25 });

      expect(cortes.criadas).toEqual([
        {
          vigencia: {
            clienteId: 'c1',
            desde: '2026-10',
            corte: { dia: 25, mes: 'proprio', consideraExame: false },
          },
          autor: { usuarioId: 'u1', em: agora },
          recalculo: ['c1'],
        },
      ]);
      expect(auditoria.eventos).toEqual([
        {
          ator: { tipo: 'usuario', id: 'u1' },
          entidade: 'corte_competencia',
          entidadeId: id,
          acao: 'criado',
          depois: { clienteId: 'c1', desde: '2026-10', ...dia25 },
          em: agora,
        },
      ]);
    });

    it('no padrão, recalcula todos', async () => {
      await criar.executar('u1', { clienteId: null, desde: '2026-11', ...dia25 });
      expect(cortes.criadas[0]?.recalculo).toBeNull();
    });

    it('"usa o padrão" do cliente grava sem corte e audita sem os campos do corte', async () => {
      await criar.executar('u1', {
        clienteId: 'c1',
        desde: '2026-11',
        usaPadrao: true,
        dia: 3,
        ultimoDia: false,
        mes: null,
        consideraExame: null,
      });
      expect(cortes.criadas[0]?.vigencia.corte).toBeNull();
      expect(auditoria.eventos[0]?.depois).toEqual({
        clienteId: 'c1',
        desde: '2026-11',
        usaPadrao: true,
        dia: null,
        ultimoDia: false,
        mes: null,
        consideraExame: null,
      });
    });

    // Review Focus 5.
    it('recusa desde igual ou anterior à última competência fechada, com o mês dela', async () => {
      const mensagem = 'A vigência tem de começar depois da última competência fechada (09/2026).';
      for (const desde of ['2026-09', '2026-08']) {
        await expect(criar.executar('u1', { clienteId: 'c1', desde, ...dia25 })).rejects.toThrow(
          mensagem,
        );
      }
      expect(cortes.criadas).toEqual([]);
      expect(auditoria.eventos).toEqual([]);
    });

    it('recusa desde anterior a uma competência fechada mais nova (reaberta a anterior)', async () => {
      // 09 reaberta e 10 fechada: desde 2026-10 ainda alcançaria a fechada.
      competencias.competencias.set('2026-09', { status: 'aberta', importacaoTravada: false });
      competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });

      await expect(
        criar.executar('u1', { clienteId: null, desde: '2026-10', ...dia25 }),
      ).rejects.toThrow(
        'A vigência tem de começar depois da última competência fechada (10/2026).',
      );
      await expect(
        criar.executar('u1', { clienteId: null, desde: '2026-09', ...dia25 }),
      ).rejects.toThrow(VigenciaInvalidaError);
    });

    it('recusa "usa o padrão" sem cliente', async () => {
      await expect(
        criar.executar('u1', { clienteId: null, desde: '2026-11', ...dia25, usaPadrao: true }),
      ).rejects.toThrow('Só o corte de um cliente pode usar o padrão.');
    });

    it('recusa desde já usado por outra vigência do mesmo cliente (ou do padrão)', async () => {
      await criar.executar('u1', { clienteId: 'c1', desde: '2026-11', ...dia25 });
      await expect(
        criar.executar('u1', { clienteId: 'c1', desde: '2026-11', ...dia25 }),
      ).rejects.toThrow(VigenciaRepetidaError);
      // Outro cliente e o padrão podem usar o mesmo mês.
      await criar.executar('u1', { clienteId: 'c2', desde: '2026-11', ...dia25 });
      await criar.executar('u1', { clienteId: null, desde: '2026-11', ...dia25 });
      await expect(
        criar.executar('u1', { clienteId: null, desde: '2026-11', ...dia25 }),
      ).rejects.toThrow('Já existe uma vigência a partir de 11/2026.');
    });

    it('recusa desde fora do formato, dia inválido e cliente inexistente', async () => {
      await expect(
        criar.executar('u1', { clienteId: 'c1', desde: '2026-13', ...dia25 }),
      ).rejects.toThrow(CompetenciaInvalidaError);
      await expect(
        criar.executar('u1', { clienteId: 'c1', desde: '2026-11', ...dia25, dia: 32 }),
      ).rejects.toThrow(VigenciaInvalidaError);
      await expect(
        criar.executar('u1', { clienteId: 'c9', desde: '2026-11', ...dia25 }),
      ).rejects.toThrow(ClienteNaoEncontradoError);
    });
  });

  describe('prévia', () => {
    it('conta quantos laudos mudam, de qual competência para qual, sem gravar nada', async () => {
      laudos.laudos.push(
        // Pelo padrão (dia 7, mês seguinte) em 2026-10; pelo dia 25 próprio, 26/10 vai para 11.
        laudo('l1', 'c1', '2026-10-26T15:00:00Z', '2026-10'),
        laudo('l2', 'c1', '2026-10-27T15:00:00Z', '2026-10'),
        // 05/11 pelo padrão fica em 10; pelo dia 25, em 11.
        laudo('l3', 'c1', '2026-11-05T15:00:00Z', '2026-10'),
        // 20/10 continua em 10.
        laudo('l4', 'c1', '2026-10-20T15:00:00Z', '2026-10'),
        // De outro cliente: não muda.
        laudo('l5', 'c2', '2026-10-26T15:00:00Z', '2026-10'),
      );

      const resultado = await previa.executar({ clienteId: 'c1', desde: '2026-10', ...dia25 });

      expect(resultado).toEqual({
        alterados: 3,
        movimentos: [{ de: '2026-10', para: '2026-11', laudos: 3 }],
      });
      expect(cortes.criadas).toEqual([]);
    });

    it('o laudo antes de desde não se mexe; o de desde em diante nunca volta para antes dele', async () => {
      laudos.laudos.push(
        // Pelo padrão em 2026-10 (< desde 2026-11): fica.
        laudo('l1', 'c1', '2026-11-05T15:00:00Z', '2026-10'),
        // 08/11 pelo padrão em 11; pelo dia 25 próprio, também 11.
        laudo('l2', 'c1', '2026-11-08T15:00:00Z', '2026-11'),
        // 26/11 pelo padrão em 11; pelo dia 25 próprio, 12.
        laudo('l3', 'c1', '2026-11-26T15:00:00Z', '2026-11'),
      );

      expect(await previa.executar({ clienteId: 'c1', desde: '2026-11', ...dia25 })).toEqual({
        alterados: 1,
        movimentos: [{ de: '2026-11', para: '2026-12', laudos: 1 }],
      });
    });

    it('no padrão, conta os laudos de todos, inclusive sem cliente, menos de quem tem corte próprio', async () => {
      cortes.porCliente.set('c2', [
        { desde: '2026-01', corte: { dia: 'ultimo', mes: 'proprio', consideraExame: true } },
      ]);
      laudos.laudos.push(
        laudo('l1', 'c1', '2026-10-26T15:00:00Z', '2026-10'),
        laudo('l2', null, '2026-10-27T15:00:00Z', '2026-10'),
        laudo('l3', 'c2', '2026-10-26T15:00:00Z', '2026-10'),
      );

      expect(await previa.executar({ clienteId: null, desde: '2026-10', ...dia25 })).toEqual({
        alterados: 2,
        movimentos: [{ de: '2026-10', para: '2026-11', laudos: 2 }],
      });
    });

    it('não conta laudo de competência travada nem o que iria para uma', async () => {
      competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: true });
      laudos.laudos.push(
        laudo('l1', 'c1', '2026-10-26T15:00:00Z', '2026-10'),
        laudo('l2', 'c1', '2026-11-26T15:00:00Z', '2026-11'),
      );

      expect(await previa.executar({ clienteId: 'c1', desde: '2026-10', ...dia25 })).toEqual({
        alterados: 0,
        movimentos: [],
      });
    });

    it('lê os laudos em lotes e ordena os movimentos', async () => {
      for (let i = 0; i < 5001; i++) {
        laudos.laudos.push(
          laudo(`a${String(i).padStart(5, '0')}`, 'c1', '2026-10-26T15:00:00Z', '2026-10'),
        );
      }
      laudos.laudos.push(laudo('z1', 'c1', '2026-11-26T15:00:00Z', '2026-11'));

      expect(await previa.executar({ clienteId: 'c1', desde: '2026-10', ...dia25 })).toEqual({
        alterados: 5002,
        movimentos: [
          { de: '2026-10', para: '2026-11', laudos: 5001 },
          { de: '2026-11', para: '2026-12', laudos: 1 },
        ],
      });
    });

    it('valida como a criação', async () => {
      await expect(
        previa.executar({ clienteId: 'c1', desde: '2026-09', ...dia25 }),
      ).rejects.toThrow(
        'A vigência tem de começar depois da última competência fechada (09/2026).',
      );
    });

    it('com a vigência igual à do padrão, nada muda', async () => {
      laudos.laudos.push(laudo('l1', 'c1', '2026-10-26T15:00:00Z', '2026-10'));
      const { corte } = CORTE_PADRAO_INICIAL;
      expect(
        await previa.executar({
          clienteId: 'c1',
          desde: '2026-10',
          usaPadrao: false,
          dia: corte.dia as number,
          ultimoDia: false,
          mes: corte.mes,
          consideraExame: corte.consideraExame,
        }),
      ).toEqual({ alterados: 0, movimentos: [] });
    });
  });
});
