import type { AvisoLevantado } from '../../../comum/avisos/registro-avisos';
import { montarDemonstrativos, type ResultadoDemonstrativos } from '../../domain/demonstrativo';
import { mesAno } from '../../domain/vigencia-corte';
import type { AvisosDoDemonstrativo } from '../ports/avisos-do-demonstrativo';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import type { DemonstrativosRepository } from '../ports/demonstrativos.repository';
import type { EntradasDemonstrativo, NomesDemonstrativo } from '../ports/entradas-demonstrativo';
import type { RecalculosCompetencia } from '../ports/recalculos-competencia';

export type PedidoGeracao =
  /** As prévias de todas as competências abertas (depois de importação, preço, tipificação...). */
  | { tipo: 'previas' }
  /** A versão do fechamento da competência que acabou de fechar. */
  | { tipo: 'fechamento'; competencia: string }
  /** A versão nova da fechada, pelo pedido de recálculo com motivo. */
  | { tipo: 'recalculo'; recalculoId: string };

/** Os avisos de uma competência: um por arranjo sem preço, um por cliente nos outros tipos. */
export function avisosDaCompetencia(
  competencia: string,
  r: ResultadoDemonstrativos,
  nomes: NomesDemonstrativo,
): AvisoLevantado[] {
  const nome = (m: ReadonlyMap<string, string>, id: string) => m.get(id) ?? id;
  const competencias = { desde: competencia, ate: competencia };
  const quando = mesAno(competencia);
  const avisos: AvisoLevantado[] = r.semPreco.map((s) => {
    const a = s.arranjo;
    return {
      tipo: 'laudo_sem_preco',
      chave: [
        competencia,
        s.clienteId,
        s.membroId,
        a.modalidadeId,
        a.especialidadeId,
        a.categoriaId,
        a.prioridadeId,
      ].join('|'),
      valor: `${nome(nomes.clientes, s.membroId)}: ${[
        nome(nomes.modalidades, a.modalidadeId),
        nome(nomes.especialidades, a.especialidadeId),
        nome(nomes.categorias, a.categoriaId),
        nome(nomes.prioridades, a.prioridadeId),
      ].join(' · ')} sem preço em ${quando}`,
      ocorrencias: s.quantidade,
      entidades: [{ tipo: 'cliente', id: s.membroId }],
      competencias,
    };
  });
  const porCliente = (
    tipo: 'laudo_sem_tipificacao' | 'laudo_arranjo_incompleto',
    lista: { clienteId: string }[],
    texto: string,
  ) => {
    const contagem = new Map<string, number>();
    for (const l of lista) contagem.set(l.clienteId, (contagem.get(l.clienteId) ?? 0) + 1);
    for (const [clienteId, n] of [...contagem].sort(([a], [b]) => a.localeCompare(b))) {
      avisos.push({
        tipo,
        chave: `${competencia}|${clienteId}`,
        valor: `${nome(nomes.clientes, clienteId)}: ${n} ${n === 1 ? 'laudo' : 'laudos'} ${texto} em ${quando}`,
        ocorrencias: n,
        entidades: [{ tipo: 'cliente', id: clienteId }],
        competencias,
      });
    }
  };
  porCliente('laudo_sem_tipificacao', r.semTipificacao, 'sem tipificação');
  porCliente('laudo_arranjo_incompleto', r.arranjoIncompleto, 'com arranjo incompleto');
  return avisos;
}

/**
 * Monta e grava os demonstrativos (job `faturamento.gerar-demonstrativos`, idempotente). As
 * prévias só nas abertas; a fechada só ganha versão pelo fechamento ou pelo recálculo com motivo.
 */
export class GerarDemonstrativos {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly entradas: EntradasDemonstrativo,
    private readonly demonstrativos: DemonstrativosRepository,
    private readonly recalculos: RecalculosCompetencia,
    private readonly avisos: AvisosDoDemonstrativo,
    private readonly agora: () => Date,
  ) {}

  async executar(pedido: PedidoGeracao): Promise<void> {
    if (pedido.tipo === 'previas') {
      const levantados: AvisoLevantado[] = [];
      for (const competencia of await this.competencias.abertas()) {
        const r = await this.gerar(competencia, 'previa', null);
        if (r) levantados.push(...r);
      }
      await this.avisos.sincronizar(levantados, this.agora());
      return;
    }
    if (pedido.tipo === 'fechamento') {
      const r = await this.gerar(pedido.competencia, 'fechamento', null);
      if (r) await this.avisos.registrar(r, this.agora());
      return;
    }
    const recalculo = await this.recalculos.obter(pedido.recalculoId);
    if (recalculo?.contexto !== 'faturamento') return;
    const r = await this.gerar(recalculo.competencia, 'recalculo', recalculo.id);
    if (r) {
      await this.avisos.registrar(r, this.agora());
      await this.recalculos.concluir(recalculo.id, this.agora());
    }
  }

  /** Os avisos levantados, ou nulo se a competência mudou de status no meio (nada gravado). */
  private async gerar(
    competencia: string,
    origem: 'previa' | 'fechamento' | 'recalculo',
    recalculoId: string | null,
  ): Promise<AvisoLevantado[] | null> {
    const { entrada, nomes } = await this.entradas.carregar(competencia);
    const r = montarDemonstrativos(entrada);
    const gravou = await this.demonstrativos.gravar({
      competencia,
      origem,
      recalculoId,
      geradoEm: this.agora(),
      demonstrativos: r.demonstrativos,
    });
    return gravou ? avisosDaCompetencia(competencia, r, nomes) : null;
  }
}
