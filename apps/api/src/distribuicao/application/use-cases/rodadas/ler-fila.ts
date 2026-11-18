import { rodarMotor } from '../../../domain/motor/rodada';
import { montarEntrada } from '../../../domain/rodada/entrada';
import { iniciarLeitura, propor, STATUS_VIVOS } from '../../../domain/rodada/maquina';
import { montarProposta } from '../../../domain/rodada/proposta';
import { type DependenciasRodada, mensagemDo } from './comum';

const DIA = 86_400_000;

const horaBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(11, 16);

/**
 * Job da leitura: lê a fila na porta, monta a entrada do motor com as tabelas e a escala do
 * instante, roda o motor e grava a proposta (todo exame lido, com o motivo dos que ficaram). Rodar
 * de novo é seguro: só age na rodada solicitada ou presa em "lendo".
 */
export class LerFila {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(rodadaId: string): Promise<void> {
    const r = await this.d.rodadas.obter(rodadaId);
    if (!r) return;
    if (r.status === 'solicitada') {
      const status = iniciarLeitura(r);
      if (!(await this.d.rodadas.mudar(rodadaId, ['solicitada'], { status }))) return;
    } else if (r.status !== 'lendo') {
      return;
    }
    const agora = this.d.agora();
    await this.d.rodadas.registrarEvento(rodadaId, 'Lendo a fila da MobileMed.', agora);

    try {
      const leitura = await this.d.fila.ler();
      const { insumos, catalogo } = await this.d.insumos.carregar(agora);
      const { config } = insumos;
      const [porExame, cotaEntregue] = await Promise.all([
        this.d.rodadas.entregues(
          leitura.semMedico.map((e) => e.idExame),
          new Date(agora.getTime() - config.diasJaEntregue * DIA),
        ),
        this.d.rodadas.cotaEntregue(
          insumos.ocorrencias
            .filter((o) => o.gratificado && !o.ausente && o.fim > agora)
            .map((o) => ({ alocacaoId: o.alocacaoId, desde: o.inicio })),
        ),
      ]);
      const montada = montarEntrada({
        agora,
        leitura,
        catalogo,
        insumos,
        entregas: { porExame, cotaEntregue },
        recortes: r.recortes,
        pseudonimo: (t) => this.d.pseudonimizador.pseudonimo(t),
      });
      const resultado = rodarMotor(montada.entrada);
      const proposta = montarProposta({
        agora,
        lidos: montada.lidos,
        resultado,
        config,
        prioridadesCliente: insumos.prioridadesCliente,
        semCatalogo: montada.semCatalogo,
        semCliente: montada.semCliente,
      });
      const { expiraEm } = propor(
        { status: 'lendo', expiraEm: null },
        agora,
        config.expiracaoPropostaMin,
      );
      const gravou = await this.d.rodadas.gravarProposta(rodadaId, {
        designacoes: proposta.designacoes,
        avisos: proposta.avisos,
        lidos: montada.lidos.length,
        urgentes: proposta.urgentes,
        insumos: proposta.insumos,
        lidaEm: agora,
        expiraEm,
      });
      if (!gravou) return;
      const previstas = proposta.designacoes.filter((d) => d.status === 'prevista');
      const medicos = new Set(previstas.map((d) => d.medicoId)).size;
      await this.d.rodadas.registrarEvento(
        rodadaId,
        `Proposta pronta: ${previstas.length} de ${montada.lidos.length} exame(s) para ${medicos} médico(s); vale até ${horaBrasilia(expiraEm)}.`,
        this.d.agora(),
      );
    } catch (erro) {
      const mensagem = mensagemDo(erro);
      await this.d.rodadas.mudar(rodadaId, STATUS_VIVOS, { status: 'falhou', erro: mensagem });
      await this.d.rodadas.registrarEvento(
        rodadaId,
        `A leitura falhou: ${mensagem}`,
        this.d.agora(),
      );
    }
  }
}
