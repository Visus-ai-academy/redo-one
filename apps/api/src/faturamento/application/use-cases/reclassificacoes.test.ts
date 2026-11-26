import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { ParametrosInvalidosError } from '../../domain/parametros-demonstrativo';
import {
  VersaoPrecoNaoEncontradaError,
  VigenciaPrecoInvalidaError,
} from '../../domain/versoes-preco';
import { CompetenciasEmMemoria, ReclassificacoesEmMemoria } from '../../testing/fakes';
import {
  CriarReclassificacaoFaturamento,
  EncerrarReclassificacaoFaturamento,
  ListarReclassificacoesFaturamento,
} from './reclassificacoes';

const agora = new Date('2026-11-26T15:00:00Z');
const dados = {
  ordem: 1,
  descricao: ' Coluna do neurologista ',
  modalidadeIds: null,
  especialidadeIds: null,
  categoriaIds: ['colunas'],
  equipeIds: ['neuros'],
  especialidadeDestinoId: 'neuro',
  categoriaDestinoId: 'sc',
};

describe('reclassificações do faturamento', () => {
  let repo: ReclassificacoesEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let auditoria: InMemoryAuditoria;
  const criar = () =>
    new CriarReclassificacaoFaturamento(repo, competencias, auditoria, () => agora);

  beforeEach(() => {
    repo = new ReclassificacoesEmMemoria();
    competencias = new CompetenciasEmMemoria();
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    auditoria = new InMemoryAuditoria();
  });

  it('cria a partir da competência aberta, com auditoria, e lista', async () => {
    const id = await criar().executar('u1', '2026-11', dados);
    expect(await new ListarReclassificacoesFaturamento(repo).executar()).toMatchObject([
      { id, descricao: 'Coluna do neurologista', vigenciaDesde: '2026-11', vigenciaAte: null },
    ]);
    expect(auditoria.eventos.map((e) => [e.entidade, e.acao])).toEqual([
      ['reclassificacao_faturamento', 'criada'],
    ]);
  });

  it('nunca a partir de competência fechada; recorte vazio não é "todos"; destino obrigatório', async () => {
    await expect(criar().executar('u1', '2026-10', dados)).rejects.toBeInstanceOf(
      VigenciaPrecoInvalidaError,
    );
    await expect(
      criar().executar('u1', '2026-11', { ...dados, categoriaIds: [] }),
    ).rejects.toBeInstanceOf(ParametrosInvalidosError);
    await expect(
      criar().executar('u1', '2026-11', {
        ...dados,
        especialidadeDestinoId: null,
        categoriaDestinoId: null,
      }),
    ).rejects.toBeInstanceOf(ParametrosInvalidosError);
    await expect(
      criar().executar('u1', '2026-11', { ...dados, descricao: ' ' }),
    ).rejects.toBeInstanceOf(ParametrosInvalidosError);
  });

  it('encerra: deixa de valer a partir da competência informada', async () => {
    const id = await criar().executar('u1', '2026-11', dados);
    await new EncerrarReclassificacaoFaturamento(
      repo,
      competencias,
      auditoria,
      () => agora,
    ).executar('u1', id, '2027-01');
    expect(repo.regras[0]?.vigenciaAte).toBe('2026-12');
    await expect(
      new EncerrarReclassificacaoFaturamento(repo, competencias, auditoria, () => agora).executar(
        'u1',
        'nao-existe',
        '2027-01',
      ),
    ).rejects.toBeInstanceOf(VersaoPrecoNaoEncontradaError);
  });
});
