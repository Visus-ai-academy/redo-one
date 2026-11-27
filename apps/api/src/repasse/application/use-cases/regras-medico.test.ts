import { describe, expect, it } from 'vitest';

import { VigenciaRepasseInvalidaError } from '../../domain/vigencia';
import type {
  DadosRegraApuracao,
  Gravacao,
  RegraApuracaoGravada,
  RegrasMedicoRepository,
  VersaoContagem,
} from '../ports/regras-medico.repository';
import {
  AlterarRegraApuracao,
  CancelarVersaoContagem,
  CriarRegraApuracao,
  EncerrarRegraApuracao,
  ListarContagemMedico,
  NovaVersaoContagem,
  RegraRepasseInvalidaError,
} from './regras-medico';

const AGORA = new Date('2026-11-26T15:00:00Z');
const autoria = { criadoEm: null, criadoPor: null };
const REGRA: DadosRegraApuracao = {
  tipo: 'percentual_repasse',
  descricao: 'Coordenação de neuro',
  valorCentavos: null,
  percentualPpm: 60000,
  divisor: 1,
  modalidadeIds: null,
  especialidadeIds: ['neuro'],
  prioridadeIds: null,
};

function montar(contagem: VersaoContagem[] = [], regras: RegraApuracaoGravada[] = []) {
  const gravadas: Gravacao<unknown>[] = [];
  let n = 0;
  const repo: RegrasMedicoRepository = {
    nomeDoMedico: async () => 'Ana',
    bloqueadas: async () => ['2026-10'],
    listarContagem: async () => contagem,
    listarRegras: async () => regras,
    listarTodasRegras: async () => ({ itens: [], total: 0 }),
    gravarContagem: async (g) => void gravadas.push(g),
    gravarRegra: async (g) => void gravadas.push(g),
    eventos: async () => new Map([['c1', [{ acao: 'encerrada', quem: 'Bruno', em: AGORA }]]]),
  };
  const args = [repo, () => AGORA, () => `n${++n}`] as const;
  return {
    listar: new ListarContagemMedico(...args),
    nova: new NovaVersaoContagem(...args),
    cancelar: new CancelarVersaoContagem(...args),
    criarRegra: new CriarRegraApuracao(...args),
    alterarRegra: new AlterarRegraApuracao(...args),
    encerrarRegra: new EncerrarRegraApuracao(...args),
    gravadas,
  };
}

const contagem = (o: Partial<VersaoContagem> & { id: string }): VersaoContagem => ({
  modo: 'todos_os_laudos',
  recortes: [],
  vigenciaDesde: null,
  vigenciaAte: null,
  ...autoria,
  ...o,
});

describe('como os laudos do médico contam', () => {
  it('lista da mais nova para a mais antiga, com quem encerrou', async () => {
    const m = montar([
      contagem({ id: 'c1', vigenciaAte: '2026-11' }),
      contagem({ id: 'c2', vigenciaDesde: '2026-12', modo: 'somente_adicionais' }),
    ]);
    const r = await m.listar.executar('m1');
    expect(r.versoes.map((v) => [v.id, v.encerradoPor])).toEqual([
      ['c2', null],
      ['c1', 'Bruno'],
    ]);
    expect(r.aPartirDeSugerido).toBe('2026-12');
  });

  it('nova versão encerra a atual na véspera', async () => {
    const m = montar([contagem({ id: 'c1' })]);
    await m.nova.executar(
      'u',
      'm1',
      { modo: 'recortes', recortes: [{ clienteId: 'h1', especialidadeId: null }] },
      '2026-12',
    );
    expect(m.gravadas[0]?.mudancas).toEqual([
      { tipo: 'encerrar', id: 'c1', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
    ]);
    expect(m.gravadas[0]?.eventos.map((e) => e.acao)).toEqual(['encerrada', 'criada']);
  });

  it('recortes: ao menos um, sem repetir, e "todos × todas" é recusado', async () => {
    const m = montar();
    for (const recortes of [
      [],
      [{ clienteId: null, especialidadeId: null }],
      [
        { clienteId: 'h1', especialidadeId: null },
        { clienteId: 'h1', especialidadeId: null },
      ],
    ])
      await expect(
        m.nova.executar('u', 'm1', { modo: 'recortes', recortes }, '2026-12'),
      ).rejects.toThrow(RegraRepasseInvalidaError);
  });

  it('cancelar a programada reabre a anterior; a que vale não se cancela', async () => {
    const m = montar([
      contagem({ id: 'c1', vigenciaAte: '2026-11' }),
      contagem({ id: 'c2', vigenciaDesde: '2026-12' }),
    ]);
    await m.cancelar.executar('u', 'm1', 'c2');
    expect(m.gravadas[0]?.mudancas.map((x) => x.tipo)).toEqual(['remover', 'reabrir']);
    await expect(m.cancelar.executar('u', 'm1', 'c1')).rejects.toThrow(
      VigenciaRepasseInvalidaError,
    );
  });
});

const regra = (o: Partial<RegraApuracaoGravada> & { id: string }): RegraApuracaoGravada => ({
  ...REGRA,
  vigenciaDesde: null,
  vigenciaAte: null,
  ...autoria,
  nomes: { modalidades: [], especialidades: ['NEURO'], prioridades: [] },
  ...o,
});

describe('regras de apuração do médico', () => {
  it('cria com valor ou percentual conforme o tipo', async () => {
    const m = montar();
    await m.criarRegra.executar('u', 'm1', { ...REGRA, valorCentavos: 999 }, '2026-11');
    expect(m.gravadas[0]?.nova).toMatchObject({ valorCentavos: null, percentualPpm: 60000 });
    await expect(
      m.criarRegra.executar('u', 'm1', { ...REGRA, tipo: 'fixo', valorCentavos: null }, '2026-11'),
    ).rejects.toThrow(RegraRepasseInvalidaError);
  });

  it('recorte vazio nunca é todas', async () => {
    await expect(
      montar().criarRegra.executar('u', 'm1', { ...REGRA, prioridadeIds: [] }, '2026-11'),
    ).rejects.toThrow(RegraRepasseInvalidaError);
  });

  it('uma tarifa própria por vez', async () => {
    const m = montar(
      [],
      [regra({ id: 'r1', tipo: 'tarifa_laudo', valorCentavos: 1000, percentualPpm: null })],
    );
    await expect(
      m.criarRegra.executar(
        'u',
        'm1',
        { ...REGRA, tipo: 'tarifa_laudo', valorCentavos: 2000, percentualPpm: null },
        '2026-12',
      ),
    ).rejects.toThrow(RegraRepasseInvalidaError);
  });

  it('alterar encerra e cria a versão nova; encerrar fecha na véspera', async () => {
    const m = montar([], [regra({ id: 'r1' })]);
    await m.alterarRegra.executar('u', 'm1', 'r1', { ...REGRA, percentualPpm: 70000 }, '2026-12');
    expect(m.gravadas[0]?.mudancas[0]).toMatchObject({ tipo: 'encerrar', vigenciaAte: '2026-11' });
    expect(m.gravadas[0]?.nova).toMatchObject({ percentualPpm: 70000, vigenciaDesde: '2026-12' });
    await m.encerrarRegra.executar('u', 'm1', 'r1', '2027-01');
    expect(m.gravadas[1]?.mudancas).toEqual([
      { tipo: 'encerrar', id: 'r1', vigenciaAteAntes: null, vigenciaAte: '2026-12' },
    ]);
  });
});
