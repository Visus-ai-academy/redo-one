import { describe, expect, it } from 'vitest';

import { VigenciaRepasseInvalidaError } from '../../domain/vigencia';
import type {
  ConfiguracaoRepasseRepository,
  DadosParametros,
} from '../ports/configuracao-repasse.repository';
import {
  ConfiguracaoInvalidaError,
  CriarAlternativaPreco,
  CriarReclassificacao,
  CriarVersaoParametros,
  EncerrarConfiguracao,
  VersaoNaoEncontradaError,
} from './configuracao';

const AGORA = new Date('2026-11-26T15:00:00Z');
const DADOS: DadosParametros = {
  tarifaPeerReviewCentavos: 2100,
  tarifaPlantaoCentavos: 35000,
  contratadoRegistroId: null,
  pagaDuplicados: true,
  diaVencimento: 20,
  diaCorteAntecipacao: 15,
  categoriaFinanceiraSocio: 'Radiologistas/Sócios',
  categoriaFinanceiraNaoSocio: 'Radiologistas/Terceiros',
  faixasListaAtraso: [{ exames: 20, valorCentavos: 20000 }],
};

function montar() {
  const eventos: string[] = [];
  const encerrados: [string, string][] = [];
  let previas = 0;
  const repo = {
    bloqueadas: async () => ['2026-10'],
    listarParametros: async () => [],
    criarParametros: async () => 'p1',
    contratadoExiste: async () => true,
    listarReclassificacoes: async () => [],
    criarReclassificacao: async () => 'r1',
    encerrarReclassificacao: async (id: string, ate: string) => {
      encerrados.push([id, ate]);
      return id === 'r1';
    },
    listarAlternativas: async () => [],
    criarAlternativa: async () => 'a1',
    encerrarAlternativa: async () => false,
  } satisfies ConfiguracaoRepasseRepository;
  const auditoria = { registrar: async (e: { acao: string }) => void eventos.push(e.acao) };
  const agendador = { previa: async () => undefined, previas: async () => void previas++ };
  const args = [repo, auditoria, agendador, () => AGORA] as const;
  return {
    parametros: new CriarVersaoParametros(...args),
    reclassificacao: new CriarReclassificacao(...args),
    alternativa: new CriarAlternativaPreco(...args),
    encerrar: new EncerrarConfiguracao(...args),
    eventos,
    encerrados,
    previas: () => previas,
  };
}

describe('configuração do repasse', () => {
  it('nova versão dos parâmetros vale de uma competência aberta, com auditoria e prévias refeitas', async () => {
    const m = montar();
    expect(await m.parametros.executar('u', '2026-11', DADOS)).toBe('p1');
    expect(m.eventos).toEqual(['criado']);
    expect(m.previas()).toBe(1);
  });

  it('recusa vigência em competência fechada e dia fora de 1 a 28', async () => {
    const m = montar();
    await expect(m.parametros.executar('u', '2026-10', DADOS)).rejects.toThrow(
      VigenciaRepasseInvalidaError,
    );
    await expect(
      m.parametros.executar('u', '2026-11', { ...DADOS, diaVencimento: 31 }),
    ).rejects.toThrow(ConfiguracaoInvalidaError);
  });

  it('reclassificação: recorte vazio nunca é "todos"', async () => {
    const m = montar();
    const base = {
      ordem: 1,
      descricao: 'Coluna do neurologista',
      modalidadeIds: null,
      especialidadeIds: null,
      categoriaIds: ['colunas'],
      equipeIds: ['neuros'],
      especialidadeDestinoId: 'neuro',
      categoriaDestinoId: 'sc',
    };
    expect(await m.reclassificacao.executar('u', '2026-11', base)).toBe('r1');
    await expect(
      m.reclassificacao.executar('u', '2026-11', { ...base, equipeIds: [] }),
    ).rejects.toThrow(ConfiguracaoInvalidaError);
  });

  it('alternativa: categoria de origem ou "sem categoria", nunca os dois', async () => {
    const m = montar();
    await expect(
      m.alternativa.executar('u', '2026-11', {
        ordem: 1,
        especialidadeId: null,
        semCategoria: true,
        categoriaOrigemId: 'colunas',
        categoriaDestinoId: 'sc',
      }),
    ).rejects.toThrow(ConfiguracaoInvalidaError);
  });

  it('encerrar: vale até a competência anterior; versão desconhecida é recusada', async () => {
    const m = montar();
    await m.encerrar.executar('u', 'reclassificacao', 'r1', '2026-12');
    expect(m.encerrados).toEqual([['r1', '2026-11']]);
    await expect(m.encerrar.executar('u', 'alternativa', 'x', '2026-12')).rejects.toThrow(
      VersaoNaoEncontradaError,
    );
  });
});
