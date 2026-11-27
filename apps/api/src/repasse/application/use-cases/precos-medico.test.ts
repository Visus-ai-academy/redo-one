import { describe, expect, it } from 'vitest';

import type {
  MudancaPrecoGravada,
  PrecosRepasseRepository,
  VersaoPrecoComNomes,
} from '../ports/precos-repasse.repository';
import {
  ExportarPrecosMedico,
  HistoricoPrecoMedico,
  ListarPrecosMedico,
  MedicoNaoEncontradoError,
  MudarPrecosMedico,
  PlanilhaPrecosRepasseInvalidaError,
} from './precos-medico';

const AGORA = new Date('2026-11-26T15:00:00Z');
const ARRANJO = {
  modalidadeId: 'tc',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rot',
};
const NOMES = { modalidade: 'TC', especialidade: 'NEURO', categoria: 'SC', prioridade: 'Rotina' };
const versao = (o: Partial<VersaoPrecoComNomes> & { id: string }): VersaoPrecoComNomes => ({
  ...ARRANJO,
  clienteId: null,
  valorCentavos: 3207,
  vigenciaDesde: null,
  vigenciaAte: null,
  nomes: { ...NOMES, cliente: null },
  ...o,
});

function montar(versoes: VersaoPrecoComNomes[] = []) {
  const aplicadas: { mudancas: MudancaPrecoGravada[]; aPartirDe: string; acoes: string[] }[] = [];
  let n = 0;
  const repo: PrecosRepasseRepository = {
    nomeDoMedico: async (id) => (id === 'm1' ? 'Dra. Ana Lima' : null),
    bloqueadas: async () => ['2026-10'],
    listarVersoes: async (_m, arranjo) =>
      versoes.filter((v) => !arranjo || v.modalidadeId === arranjo.modalidadeId),
    aplicar: async (_m, mudancas, o) =>
      void aplicadas.push({
        mudancas,
        aPartirDe: o.aPartirDe,
        acoes: o.eventos.map((e) => e.acao),
      }),
    opcoes: async () => ({
      modalidades: [{ id: 'tc', nome: 'TC' }],
      especialidades: [{ id: 'neuro', nome: 'NEURO' }],
      categorias: [{ id: 'sc', nome: 'SC' }],
      prioridades: [{ id: 'rot', nome: 'Rotina' }],
      clientes: [{ id: 'h1', nome: 'Hospital Exemplo' }],
    }),
    eventos: async () => new Map([['a', [{ acao: 'criado', quem: 'Bruno Reis', em: AGORA }]]]),
  };
  const agora = () => AGORA;
  return {
    listar: new ListarPrecosMedico(repo, agora),
    historico: new HistoricoPrecoMedico(repo, agora),
    mudar: new MudarPrecosMedico(repo, agora, () => `novo${++n}`),
    exportar: new ExportarPrecosMedico(repo, agora),
    aplicadas,
  };
}

describe('preços de repasse do médico', () => {
  it('lista o que vale e o programado, com a competência sugerida e a busca por cliente', async () => {
    const m = montar([
      versao({ id: 'a' }),
      versao({ id: 'b', clienteId: 'h1', nomes: { ...NOMES, cliente: 'Hospital Exemplo' } }),
      versao({ id: 'velha', vigenciaAte: '2026-09' }),
    ]);
    const t = await m.listar.executar('m1', { pagina: 1, porPagina: 10 });
    expect(t.itens.map((i) => i.id)).toEqual(['a', 'b']);
    expect([t.aPartirDeMinimo, t.aPartirDeSugerido]).toEqual(['2026-11', '2026-12']);
    const todos = await m.listar.executar('m1', { pagina: 1, porPagina: 10, busca: 'todos' });
    expect(todos.itens.map((i) => i.id)).toEqual(['a']);
  });

  it('médico que não existe é 404', async () => {
    await expect(montar().listar.executar('x', { pagina: 1, porPagina: 10 })).rejects.toThrow(
      MedicoNaoEncontradoError,
    );
  });

  it('o histórico é do arranjo e do cliente, com quem criou', async () => {
    const m = montar([versao({ id: 'a' }), versao({ id: 'b', clienteId: 'h1' })]);
    const h = await m.historico.executar('m1', ARRANJO, null);
    expect(h.map((v) => [v.id, v.criadoPor])).toEqual([['a', 'Bruno Reis']]);
  });

  it('alterar grava o encerramento e a versão nova com auditoria', async () => {
    const m = montar([versao({ id: 'a' })]);
    const id = await m.mudar.alterar(
      'u',
      'm1',
      'a',
      { ...ARRANJO, clienteId: null, valorCentavos: 4800 },
      '2026-12',
    );
    expect(id).toBe('novo1');
    expect(m.aplicadas[0]?.acoes).toEqual(['encerrado', 'criado']);
  });

  it('importa a planilha exportada sem mudar nada e a linha nova a partir da competência', async () => {
    const m = montar([versao({ id: 'a' })]);
    const { conteudo } = await m.exportar.executar('m1');
    expect(await m.mudar.importar('u', 'm1', conteudo, '2026-12')).toEqual({
      incluidos: 0,
      alterados: 0,
      iguais: 1,
    });
    const csv = `${conteudo}TC;NEURO;SC;Rotina;Hospital Exemplo;45,00;\r\n`;
    expect(await m.mudar.importar('u', 'm1', csv, '2026-12')).toEqual({
      incluidos: 1,
      alterados: 0,
      iguais: 1,
    });
    expect(m.aplicadas[0]?.aPartirDe).toBe('2026-12');
  });

  it('a planilha com problema não grava nada', async () => {
    const m = montar();
    const csv =
      'Modalidade;Especialidade;Categoria;Prioridade;Cliente;Valor;Vale a partir de\nXX;NEURO;SC;Rotina;Todos os clientes;1,00;\n';
    await expect(m.mudar.importar('u', 'm1', csv, '2026-12')).rejects.toThrow(
      PlanilhaPrecosRepasseInvalidaError,
    );
    expect(m.aplicadas).toEqual([]);
  });
});
