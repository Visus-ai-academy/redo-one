import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIGURACAO_INICIAL } from '../../domain/configuracao-global';
import { ConfiguracaoEmMemoria, RetratoFilaEmMemoria } from '../../testing/fakes';
import {
  AgendarLeituraFila,
  ConsultarRetratoFila,
  LerRetratoFila,
  PedirLeituraFila,
} from './retrato-fila';
import type { FilaDoMomento } from './rodadas/consultas';

const t0 = new Date('2026-11-19T12:00:00Z');
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

const filaLida = (lidaEm: Date, total = 3): FilaDoMomento => ({
  lidaEm,
  total,
  urgentes: 1,
  vencidos: 0,
  vencemProximaHora: 0,
  primeiroVencimento: null,
  proximoVencimento: null,
  habilitados: 2,
  roboAtivo: true,
  prioridades: [],
  porFrente: [],
  grupos: [],
  turnos: [],
  semCatalogo: 0,
  semCliente: 0,
  porPrioridade: [],
  porEspecialidade: [],
  porModalidade: [],
  medicosEmTurno: [],
});

describe('retrato da fila do momento', () => {
  let agora: Date;
  let repo: RetratoFilaEmMemoria;
  let configuracao: ConfiguracaoEmMemoria;
  let montar: { executar: () => Promise<FilaDoMomento> };

  beforeEach(() => {
    agora = t0;
    repo = new RetratoFilaEmMemoria();
    configuracao = new ConfiguracaoEmMemoria();
    montar = { executar: async () => filaLida(agora) };
  });

  const relogio = () => agora;

  describe('leitura (job)', () => {
    it('grava o retrato com a hora da leitura e apaga a falha anterior', async () => {
      await repo.registrarFalha(min(-5), 'fora do ar');
      expect(await new LerRetratoFila(montar, repo, relogio).executar()).toBeNull();
      expect(await repo.obter()).toMatchObject({
        fila: { lidaEm: t0, total: 3 },
        falhouEm: null,
        erro: null,
      });
    });

    it('falhou: o retrato anterior fica e a falha é anotada com a hora', async () => {
      await repo.gravar(filaLida(min(-5), 7));
      montar.executar = async () => {
        throw new Error('MobileMed respondeu 503');
      };
      expect(await new LerRetratoFila(montar, repo, relogio).executar()).toBe(
        'MobileMed respondeu 503',
      );
      expect(await repo.obter()).toMatchObject({
        fila: { lidaEm: min(-5), total: 7 },
        falhouEm: t0,
        erro: 'MobileMed respondeu 503',
      });
    });
  });

  describe('agendamento (a cada minuto)', () => {
    const agendar = () => new AgendarLeituraFila(configuracao, repo, relogio).executar();

    it('nunca lida: pede a leitura', async () => {
      expect(await agendar()).toBe(true);
      expect(repo.pedidos).toBe(1);
    });

    it('pede de novo só quando passou o intervalo da configuração (padrão 5 min)', async () => {
      expect(CONFIGURACAO_INICIAL.retratoFilaMin).toBe(5);
      await repo.gravar(filaLida(t0));
      agora = min(4);
      expect(await agendar()).toBe(false);
      agora = min(5);
      expect(await agendar()).toBe(true);
      expect(repo.pedidos).toBe(1);
    });

    it('conta a partir da última tentativa: falha ou pedido ainda na fila', async () => {
      await repo.gravar(filaLida(min(-30)));
      await repo.registrarFalha(min(-2), 'x');
      expect(await agendar()).toBe(false);
      await repo.pedirLeitura(min(-1));
      agora = min(3);
      expect(await agendar()).toBe(false);
      agora = min(4);
      expect(await agendar()).toBe(true);
    });

    it('segue o intervalo gravado; desligado, nunca pede', async () => {
      configuracao.atual = { ...CONFIGURACAO_INICIAL, retratoFilaMin: 15 };
      await repo.gravar(filaLida(t0));
      agora = min(10);
      expect(await agendar()).toBe(false);
      agora = min(15);
      expect(await agendar()).toBe(true);

      configuracao.atual = { ...CONFIGURACAO_INICIAL, retratoFilaMin: null };
      agora = min(600);
      expect(await agendar()).toBe(false);
      expect(repo.pedidos).toBe(1);
    });
  });

  describe('"Ler agora"', () => {
    it('enfileira a leitura e a tela passa a mostrar "lendo"', async () => {
      await repo.gravar(filaLida(min(-3)));
      await new PedirLeituraFila(repo, relogio).executar();
      expect(repo.pedidos).toBe(1);
      const r = await new ConsultarRetratoFila(repo, configuracao).executar();
      expect(r).toMatchObject({ lendo: true, pedidaEm: t0 });
    });
  });

  describe('consulta da tela', () => {
    const consultar = () => new ConsultarRetratoFila(repo, configuracao).executar();

    it('nunca lida: sem fila, sem falha, com o intervalo', async () => {
      expect(await consultar()).toEqual({
        fila: null,
        pedidaEm: null,
        lendo: false,
        falha: null,
        intervaloMin: 5,
      });
    });

    it('o robô ligado ou não vem da configuração de agora, não do retrato', async () => {
      await repo.gravar(filaLida(t0));
      configuracao.atual = { ...CONFIGURACAO_INICIAL, roboAtivo: false, retratoFilaMin: null };
      expect(await consultar()).toMatchObject({
        fila: { roboAtivo: false, lidaEm: t0 },
        intervaloMin: null,
      });
    });

    it('a última leitura falhou: a falha e o retrato anterior', async () => {
      await repo.gravar(filaLida(min(-10)));
      await repo.registrarFalha(min(-1), 'tempo esgotado');
      expect(await consultar()).toMatchObject({
        fila: { lidaEm: min(-10) },
        lendo: false,
        falha: { em: min(-1), erro: 'tempo esgotado' },
      });
    });

    it('lendo só enquanto o pedido é mais novo que a última leitura ou falha', async () => {
      await repo.pedirLeitura(min(-1));
      await repo.gravar(filaLida(t0));
      expect((await consultar()).lendo).toBe(false);
      await repo.pedirLeitura(min(1));
      expect((await consultar()).lendo).toBe(true);
      await repo.registrarFalha(min(2), 'x');
      expect((await consultar()).lendo).toBe(false);
    });
  });
});
