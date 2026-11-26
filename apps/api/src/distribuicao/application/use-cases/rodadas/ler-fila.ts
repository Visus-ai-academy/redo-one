import { rodarMotor } from '../../../domain/motor/rodada';
import { contasForaDaUnidade } from '../../../domain/rodada/contas-fora-da-unidade';
import { escalaDosMedicos, montarEntrada } from '../../../domain/rodada/entrada';
import { grafiasSemDePara } from '../../../domain/rodada/grafias-sem-de-para';
import { iniciarLeitura, propor, STATUS_VIVOS } from '../../../domain/rodada/maquina';
import { montarProposta } from '../../../domain/rodada/proposta';
import { entregasComRecolhidos, leituraComRecolhidos } from '../../../domain/rodada/recolhimento';
import { type DependenciasRodada, mensagemDo } from './comum';
import { lerRecolhimento } from './recolhimento';

const DIA = 86_400_000;

const horaBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(11, 16);

/**
 * Job da leitura: lê a fila na porta, monta a entrada do motor com as tabelas e a escala do
 * instante, roda o motor e grava a proposta (todo exame lido, com o motivo dos que ficaram). Rodar
 * de novo é seguro: só age na rodada solicitada ou presa em "lendo".
 */
export class LerFila {
  constructor(private readonly d: DependenciasRodada) {}

  /**
   * As contas liberadas em cada unidade da fila (memória entre rodadas, ou lidas agora). A lista
   * que falha não segura a proposta: naquela unidade não há filtro, e a execução confere na hora.
   */
  private async contasPorUnidade(
    rodadaId: string,
    exames: readonly { unidadeMobilemed?: number | null }[],
    validadeMin: number | null,
  ): Promise<ReadonlyMap<number, ReadonlySet<number>> | undefined> {
    if (validadeMin === null) return undefined;
    const unidades = [
      ...new Set(exames.flatMap((e) => (e.unidadeMobilemed == null ? [] : [e.unidadeMobilemed]))),
    ];
    if (!unidades.length) return undefined;
    const { porUnidade, falharam } = await this.d.contasUnidade.liberadas(unidades, validadeMin);
    if (falharam.length) {
      await this.d.rodadas.registrarEvento(
        rodadaId,
        `Aviso: não deu para ler na MobileMed a lista de médicos de ${falharam.length} unidade(s); nelas a proposta não conferiu se a conta do médico está liberada (a execução confere na hora).`,
        this.d.agora(),
      );
    }
    return porUnidade;
  }

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
      const lida = await this.d.fila.ler();
      const { insumos, catalogo } = await this.d.insumos.carregar(agora);
      const { config } = insumos;
      // O recolhimento roda no começo da rodada: o recolhido entra na fila dela, sem sair do médico.
      const recolhimento = await lerRecolhimento(this.d, {
        agora,
        leitura: lida,
        insumos,
        catalogo,
      });
      const recolhidos = recolhimento?.recolhidos ?? [];
      const leitura = leituraComRecolhidos(lida, recolhidos);
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
      const contasPorUnidade = await this.contasPorUnidade(
        rodadaId,
        leitura.semMedico,
        config.contasUnidadeValidadeMin,
      );
      const montada = montarEntrada({
        contasPorUnidade,
        agora,
        leitura,
        catalogo,
        insumos,
        entregas: { porExame: entregasComRecolhidos(porExame, recolhidos, agora), cotaEntregue },
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
        clientesInativos: montada.clientesInativos,
        escalaDosMedicos: escalaDosMedicos(insumos, agora),
        habilitados: insumos.medicos.map((m) => m.id),
        recolhimento,
      });
      const { expiraEm } = propor(
        { status: 'lendo', expiraEm: null },
        agora,
        config.expiracaoPropostaMin,
      );
      const gravou = await this.d.rodadas.gravarProposta(rodadaId, {
        designacoes: proposta.designacoes,
        avisos: proposta.avisos,
        lidos: lida.semMedico.length,
        recolhidos: proposta.recolhidos,
        urgentes: proposta.urgentes,
        insumos: proposta.insumos,
        lidaEm: agora,
        expiraEm,
      });
      if (!gravou) return;
      // O nome do paciente que a leitura já trouxe fica só em memória, para a conferência.
      this.d.nomesPacientes.limpar(rodadaId);
      this.d.nomesPacientes.guardar(
        rodadaId,
        new Map(
          leitura.semMedico
            .filter((e) => e.paciente.nome?.trim())
            .map((e) => [e.idExame, e.paciente.nome as string]),
        ),
        agora,
      );
      const { pendentes, conferidas } = grafiasSemDePara(
        leitura.semMedico.map((e) => e.prioridade),
        insumos.prioridadesOperacao,
      );
      try {
        await this.d.avisosPrioridade.registrar(pendentes, conferidas, agora);
      } catch (erro) {
        // O aviso não segura a proposta: a tela da rodada já mostra a grafia sem de-para.
        await this.d.rodadas.registrarEvento(
          rodadaId,
          `Não foi possível registrar os avisos de prioridade: ${mensagemDo(erro)}`,
          this.d.agora(),
        );
      }
      try {
        // A leitura vê a fila inteira (os recortes só valem no motor): é a verificação completa.
        await this.d.avisosClienteInativo.sincronizar(montada.clientesInativos, agora);
      } catch (erro) {
        await this.d.rodadas.registrarEvento(
          rodadaId,
          `Não foi possível registrar os avisos de cliente inativo: ${mensagemDo(erro)}`,
          this.d.agora(),
        );
      }
      if (contasPorUnidade) {
        const contas = contasForaDaUnidade({
          exames: leitura.semMedico,
          designacoes: proposta.designacoes,
          conferidas: new Set(contasPorUnidade.keys()),
          nomes: new Map(insumos.medicos.map((m) => [m.id, m.nome])),
        });
        try {
          // Só avisa: o cadastro do médico (e as outras contas) não muda sozinho.
          await this.d.avisosContaUnidade.registrar(contas.pendentes, contas.conferidas, agora);
        } catch (erro) {
          await this.d.rodadas.registrarEvento(
            rodadaId,
            `Não foi possível registrar os avisos de conta não liberada na unidade: ${mensagemDo(erro)}`,
            this.d.agora(),
          );
        }
      }
      const previstas = proposta.designacoes.filter((d) => d.status === 'prevista');
      const medicos = new Set(previstas.map((d) => d.medicoId)).size;
      const naRodada = lida.semMedico.length + proposta.recolhidos;
      const comRecolhidos = proposta.recolhidos ? `, ${proposta.recolhidos} recolhido(s),` : '';
      await this.d.rodadas.registrarEvento(
        rodadaId,
        `Proposta pronta: ${previstas.length} de ${naRodada} exame(s)${comRecolhidos} para ${medicos} médico(s); vale até ${horaBrasilia(expiraEm)}.`,
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
