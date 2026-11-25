import { textoDoPaciente } from '../../../../ingestao/domain/preparar-laudo';
import { RegrasPorFrente } from '../../../domain/motor/configuracao';
import type { CatalogoDaFila, InsumosRodada, Leitura } from '../../../domain/rodada/entrada';
import { type Recolhimento, recolher } from '../../../domain/rodada/recolhimento';
import type { DependenciasRodada } from './comum';

const MIN = 60_000;
const DIA = 1440 * MIN;

/**
 * O recolhimento no instante da leitura: a última entrega do robô de cada exame em mãos, a escala
 * que pode estar em curso agora (da véspera do maior fim ainda dentro do maior prazo), as ausências de
 * hoje e as contas dos médicos. Undefined = desligado (carência nula na configuração).
 */
export async function lerRecolhimento(
  d: DependenciasRodada,
  p: { agora: Date; leitura: Leitura; insumos: InsumosRodada; catalogo: CatalogoDaFila },
): Promise<Recolhimento | undefined> {
  const { agora, leitura, insumos, catalogo } = p;
  const { config } = insumos;
  if (config.recolhimentoAposTurnoMin === null) return undefined;

  // A escala que ainda pode segurar um exame: a do maior prazo (o padrão ou o de algum turno).
  const carencia = Math.max(
    config.recolhimentoAposTurnoMin,
    ...config.recolhimentoPorTurno.map((p) => p.minutos),
  );
  const [entregas, periodos, ausencias] = await Promise.all([
    d.rodadas.ultimasEntregas(leitura.emMaos.map((e) => e.idExame)),
    d.escalaRecolhimento.periodos(new Date(agora.getTime() - carencia * MIN - DIA), agora),
    d.escalaRecolhimento.ausenciasDoDia(agora),
  ]);
  const cadastro = await d.medicos.doCadastro([
    ...new Set([
      ...[...entregas.values()].map((e) => e.medicoId),
      ...ausencias.map((a) => a.medicoId),
    ]),
  ]);
  const regras = new RegrasPorFrente(insumos.regrasFrente);
  return recolher({
    agora,
    parametros: {
      carenciaMin: config.recolhimentoAposTurnoMin,
      carenciaPorTurno: new Map(config.recolhimentoPorTurno.map((p) => [p.turnoId, p.minutos])),
      antecedenciaMin: config.antecedenciaPeriodoMin,
      escalaRestringeEspecialidade: config.escalaRestringeEspecialidade,
    },
    exames: leitura.emMaos.map((e) => {
      const c = catalogo.classificar(e);
      return {
        idExame: e.idExame,
        medicoIdMobilemed: e.medicoIdMobilemed,
        status: e.status,
        pacienteChave: d.pseudonimizador.pseudonimo(
          textoDoPaciente({ codigoPaciente: e.paciente.codigo, nomePaciente: e.paciente.nome }),
        ),
        especialidadeId: c.especialidadeId,
        modalidadeId: c.modalidadeId,
        subespecialidadeId: c.subespecialidadeId,
        especialidadesDoSegmento: c.especialidadesDoSegmento,
      };
    }),
    entregas,
    contas: new Map(
      [...cadastro].map(([id, m]) => [
        id,
        [...(m.idMobilemed === null ? [] : [m.idMobilemed]), ...(m.outrasContas ?? [])],
      ]),
    ),
    periodos,
    ausencias,
    recolhe: (e) => regras.doExame(e)?.recolheAoFimDoTurno ?? true,
  });
}

export interface RecolhimentoPrevisto {
  /** Falso = carência nula na configuração (recolhimento desligado). */
  ligado: boolean;
  /** Exames que sairiam dos médicos se a rodada fosse pedida agora. */
  recolhiveis: number;
  /** Desses, os de médico com ausência hoje. */
  porAusencia: number;
}

/**
 * Prévia do "Distribuir agora": quantos exames a rodada recolheria agora (se houver quem os pegue).
 * Lê a fila e a escala, sem gravar nada.
 */
export class PreverRecolhimento {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(): Promise<RecolhimentoPrevisto> {
    const agora = this.d.agora();
    const { insumos, catalogo } = await this.d.insumos.carregar(agora);
    if (insumos.config.recolhimentoAposTurnoMin === null) {
      return { ligado: false, recolhiveis: 0, porAusencia: 0 };
    }
    const leitura = await this.d.fila.ler();
    const r = await lerRecolhimento(this.d, { agora, leitura, insumos, catalogo });
    const recolhidos = r?.recolhidos ?? [];
    return {
      ligado: r !== undefined,
      recolhiveis: recolhidos.length,
      porAusencia: recolhidos.filter((x) => x.motivo === 'ausencia').length,
    };
  }
}
