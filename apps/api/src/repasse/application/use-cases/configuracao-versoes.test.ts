import { describe, expect, it } from 'vitest';

import type { MudancaVersao } from '../../domain/versoes';
import { VigenciaRepasseInvalidaError } from '../../domain/vigencia';
import type {
  ConfiguracaoRepasseRepository,
  ParametrosRepasse,
  Reclassificacao,
} from '../ports/configuracao-repasse.repository';
import type { VersoesConfiguracaoRepository } from '../ports/versoes-configuracao.repository';
import {
  AlterarReclassificacao,
  CancelarVersaoConfiguracao,
  ListarParametrosComAutoria,
  ListarRegrasComNomes,
} from './configuracao-versoes';

const AGORA = new Date('2026-11-26T15:00:00Z');
const RECLASS: Reclassificacao = {
  id: 'r1',
  ordem: 1,
  descricao: 'Coluna do neurologista',
  modalidadeIds: null,
  especialidadeIds: ['msk'],
  categoriaIds: ['colunas'],
  equipeIds: ['neuros'],
  especialidadeDestinoId: 'neuro',
  categoriaDestinoId: 'sc',
  vigenciaDesde: null,
  vigenciaAte: null,
};
const PARAM = (id: string, desde: string): ParametrosRepasse => ({
  id,
  vigenciaDesde: desde,
  tarifaPeerReviewCentavos: 2100,
  tarifaPlantaoCentavos: 35000,
  contratadoRegistroId: 'c1',
  pagaDuplicados: true,
  diaVencimento: 20,
  diaCorteAntecipacao: 15,
  categoriaFinanceiraSocio: 'Sócios',
  categoriaFinanceiraNaoSocio: 'Terceiros',
  faixasListaAtraso: [],
  criadoEm: AGORA,
});

function montar(reclass: Reclassificacao[] = [RECLASS], parametros = [PARAM('p1', '0001-01')]) {
  const gravadas: { mudancas: MudancaVersao[]; nova: unknown }[] = [];
  const excluidos: string[] = [];
  const acoes: string[] = [];
  let previas = 0;
  const repo = {
    bloqueadas: async () => ['2026-10'],
    listarParametros: async () => parametros,
    listarReclassificacoes: async () => reclass,
    listarAlternativas: async () => [],
  } as unknown as ConfiguracaoRepasseRepository;
  const versoes: VersoesConfiguracaoRepository = {
    nomes: async () =>
      new Map([
        ['msk', 'MÚSCULO ESQUELÉTICO'],
        ['colunas', 'COLUNAS'],
        ['neuros', 'Neurologistas'],
        ['neuro', 'NEURO'],
        ['sc', 'SC'],
        ['c1', 'Teleimagem'],
      ]),
    eventos: async () => new Map([['p2', [{ acao: 'criado', quem: 'Bruno', em: AGORA }]]]),
    gravarReclassificacao: async (mudancas, nova) => {
      gravadas.push({ mudancas, nova });
      return nova ? 'nova' : null;
    },
    gravarAlternativa: async () => null,
    excluirParametros: async (id) => {
      excluidos.push(id);
      return true;
    },
  };
  const auditoria = { registrar: async (e: { acao: string }) => void acoes.push(e.acao) };
  const agendador = { previa: async () => undefined, previas: async () => void previas++ };
  const args = [repo, versoes, auditoria, agendador, () => AGORA] as const;
  return {
    regras: new ListarRegrasComNomes(...args),
    parametros: new ListarParametrosComAutoria(...args),
    alterar: new AlterarReclassificacao(...args),
    cancelar: new CancelarVersaoConfiguracao(...args),
    gravadas,
    excluidos,
    acoes,
    previas: () => previas,
  };
}

describe('versões da configuração do repasse', () => {
  it('as regras vêm com os nomes ("todas" continua nulo)', async () => {
    const r = await montar().regras.executar();
    expect(r.reclassificacoes[0]?.nomes).toEqual({
      modalidades: null,
      especialidades: ['MÚSCULO ESQUELÉTICO'],
      categorias: ['COLUNAS'],
      equipes: ['Neurologistas'],
      especialidadeDestino: 'NEURO',
      categoriaDestino: 'SC',
    });
    expect(r.reclassificacoes[0]?.criadoPor).toBeNull();
  });

  it('os parâmetros vêm do mais novo, cada um até a véspera do seguinte', async () => {
    const r = await montar(undefined, [
      PARAM('p1', '0001-01'),
      PARAM('p2', '2026-12'),
    ]).parametros.executar();
    expect(r.versoes.map((v) => [v.id, v.vigenciaAte, v.criadoPor, v.contratadoRegistro])).toEqual([
      ['p2', null, 'Bruno', 'Teleimagem'],
      ['p1', '2026-11', null, 'Teleimagem'],
    ]);
  });

  it('alterar a reclassificação encerra e cria, com auditoria e prévias', async () => {
    const m = montar();
    const { id: _, vigenciaDesde: __, vigenciaAte: ___, ...dados } = RECLASS;
    expect(await m.alterar.executar('u', 'r1', '2026-12', { ...dados, ordem: 2 })).toBe('nova');
    expect(m.gravadas[0]?.mudancas).toEqual([
      { tipo: 'encerrar', id: 'r1', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
    ]);
    expect(m.acoes).toEqual(['encerrada', 'criada']);
    expect(m.previas()).toBe(1);
  });

  it('cancelar a reclassificação programada reabre a de mesma ordem', async () => {
    const m = montar([
      { ...RECLASS, vigenciaAte: '2026-12' },
      { ...RECLASS, id: 'r2', vigenciaDesde: '2027-01' },
    ]);
    await m.cancelar.executar('u', 'reclassificacao', 'r2');
    expect(m.gravadas[0]?.mudancas.map((x) => x.tipo)).toEqual(['remover', 'reabrir']);
    expect(m.acoes).toEqual(['cancelada', 'reaberta']);
  });

  it('parâmetros: só a versão programada se cancela', async () => {
    const m = montar(undefined, [PARAM('p1', '0001-01'), PARAM('p2', '2026-12')]);
    await m.cancelar.executar('u', 'parametros', 'p2');
    expect(m.excluidos).toEqual(['p2']);
    await expect(m.cancelar.executar('u', 'parametros', 'p1')).rejects.toThrow(
      VigenciaRepasseInvalidaError,
    );
  });
});
