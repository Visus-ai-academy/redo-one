import type { Auditoria } from '../../../auditoria/auditoria';
import type { CompetenciasBloqueadas } from '../../../ingestao/application/ports/competencias-bloqueadas';
import { diaBrasilia } from '../../../ingestao/domain/competencia';
import { ParametrosInvalidosError } from '../../domain/parametros-demonstrativo';
import type { ReclassificacaoFaturamento } from '../../domain/reclassificacao';
import {
  anterior,
  VersaoPrecoNaoEncontradaError,
  validarAPartirDe,
} from '../../domain/versoes-preco';
import type { ReclassificacoesRepository } from '../ports/reclassificacoes.repository';

const ENTIDADE = 'reclassificacao_faturamento';

async function validar(competencias: CompetenciasBloqueadas, agora: () => Date, aPartirDe: string) {
  validarAPartirDe(aPartirDe, {
    mesAtual: diaBrasilia(agora()).slice(0, 7),
    bloqueadas: await competencias.listar(),
  });
}

export class ListarReclassificacoesFaturamento {
  constructor(private readonly repo: ReclassificacoesRepository) {}

  async executar(): Promise<ReclassificacaoFaturamento[]> {
    return (await this.repo.listar()).sort(
      (a, b) => a.ordem - b.ordem || (b.vigenciaDesde ?? '').localeCompare(a.vigenciaDesde ?? ''),
    );
  }
}

export type DadosReclassificacao = Omit<
  ReclassificacaoFaturamento,
  'id' | 'vigenciaDesde' | 'vigenciaAte'
>;

/** Recorte nulo = todos; lista vazia não é "todos" (é erro). */
function recorte(lista: readonly string[] | null, nome: string) {
  if (lista !== null && lista.length === 0)
    throw new ParametrosInvalidosError(`${nome}: escolha ao menos um ou marque "todos".`);
}

/** Cria a reclassificação a partir de competência aberta ou futura. Auditada. */
export class CriarReclassificacaoFaturamento {
  constructor(
    private readonly repo: ReclassificacoesRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, aPartirDe: string, r: DadosReclassificacao): Promise<string> {
    await validar(this.competencias, this.agora, aPartirDe);
    const descricao = r.descricao.trim();
    if (!descricao) throw new ParametrosInvalidosError('Descreva a reclassificação.');
    recorte(r.modalidadeIds, 'Modalidades');
    recorte(r.especialidadeIds, 'Especialidades');
    recorte(r.categoriaIds, 'Categorias');
    recorte(r.equipeIds, 'Equipes');
    if (!r.especialidadeDestinoId && !r.categoriaDestinoId)
      throw new ParametrosInvalidosError('Informe a especialidade ou a categoria de destino.');
    const em = this.agora();
    const dados = { ...r, descricao };
    const id = await this.repo.criar({ ...dados, vigenciaDesde: aPartirDe }, { usuarioId, em });
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'criada',
      depois: { aPartirDe, ...dados },
      em,
    });
    return id;
  }
}

/** A reclassificação deixa de valer a partir da competência informada (nada se apaga). */
export class EncerrarReclassificacaoFaturamento {
  constructor(
    private readonly repo: ReclassificacoesRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, id: string, aPartirDe: string): Promise<void> {
    await validar(this.competencias, this.agora, aPartirDe);
    const ate = anterior(aPartirDe);
    if (!(await this.repo.encerrar(id, ate))) throw new VersaoPrecoNaoEncontradaError();
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'encerrada',
      depois: { vigenciaAte: ate },
      em: this.agora(),
    });
  }
}
