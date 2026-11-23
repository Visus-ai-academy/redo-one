import {
  desfechoExecucao,
  iniciarExecucao,
  STATUS_VIVOS,
  type StatusRodada,
} from '../../../domain/rodada/maquina';
import { ordemDeExecucao } from '../../../domain/rodada/proposta';
import type { ResultadoAtribuicao } from '../../ports/atribuidor-exames';
import type { ResultadoDesignacao } from '../../ports/rodadas.repository';
import { configuracaoAtual, type DependenciasRodada, mensagemDo } from './comum';

const comoResultado = (r: ResultadoAtribuicao): ResultadoDesignacao =>
  r.status === 'executada'
    ? { status: 'executada', motivo: null, detalhe: null, retentavel: false }
    : r;

/**
 * Job da execução: atribui as previstas pela porta, uma por vez, na ordem da fila do momento, com o
 * progresso no diário e o resultado por item. Confere a pausa (e o cancelamento) entre um exame e
 * outro. Ao fim: concluída, parcial (sobrou o que tentar) ou falhou (nada saiu). Rodar de novo é
 * seguro: só a prevista é atribuída.
 */
export class ExecutarRodada {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(rodadaId: string): Promise<void> {
    const r = await this.d.rodadas.obter(rodadaId);
    if (!r) return;
    // Retomada (ou o job que caiu no meio): a fila pode ter mudado; confere cada exame antes.
    const conferir = r.retomadas > 0 || r.status === 'executando';
    if (r.status === 'aprovada') {
      const status = iniciarExecucao(r);
      if (!(await this.d.rodadas.mudar(rodadaId, ['aprovada'], { status }))) return;
    } else if (r.status !== 'executando') {
      return;
    }

    try {
      const [config, prioridadesCliente, previstas] = await Promise.all([
        configuracaoAtual(this.d),
        this.d.prioridadesCliente.todas(),
        this.d.rodadas.previstas(rodadaId),
      ]);
      const ordem = ordemDeExecucao(previstas, config, prioridadesCliente, this.d.agora());
      const porId = new Map(previstas.map((p) => [p.id, p]));
      // Do cadastro de agora, não da hora da proposta: a conta corrigida no meio já vale.
      const contas = await this.d.medicos.doCadastro([
        ...new Set(
          previstas.flatMap((p) => [p.medicoId, p.recolhidoDeId].filter((x) => x !== null)),
        ),
      ]);
      const total = ordem.length;
      for (const [i, id] of ordem.entries()) {
        const atual = await this.d.rodadas.obter(rodadaId);
        if (atual?.status !== 'executando') break;
        const p = porId.get(id);
        const conta = p?.medicoId ? contas.get(p.medicoId) : undefined;
        // Recolhido: a conta de quem o tem (a MobileMed só troca se ele segue com ela, NOVO).
        const de = p?.recolhidoDeId ? (contas.get(p.recolhidoDeId)?.idMobilemed ?? null) : null;
        let resultado: ResultadoDesignacao;
        if (!p?.medicoId || !conta?.ativo || conta.idMobilemed === null) {
          resultado = {
            status: 'falhou',
            motivo: 'sem_conta_mobilemed',
            detalhe: 'O médico está inativo ou sem conta na MobileMed no cadastro.',
            retentavel: false,
          };
        } else if (p.recolhidoDeId && de === null) {
          resultado = {
            status: 'falhou',
            motivo: 'sem_conta_mobilemed',
            detalhe: 'O médico de quem o exame foi recolhido está sem conta na MobileMed.',
            retentavel: false,
          };
        } else if (
          conferir &&
          !(await this.d.fila.intocados([{ idExame: p.idExameMobilemed, medicoIdMobilemed: de }]))
            .size
        ) {
          resultado = {
            status: 'pulada',
            motivo: 'ja_atribuido_mobilemed',
            detalhe: p.recolhidoDeId
              ? 'Pulado ao retomar: o médico já abriu o exame recolhido ou ele mudou de mão na MobileMed.'
              : 'Pulado ao retomar: já atribuído na MobileMed (ganhou médico por fora do robô).',
            retentavel: false,
          };
        } else {
          try {
            resultado = comoResultado(
              await this.d.atribuidor.atribuir({
                idExame: p.idExameMobilemed,
                medicoIdMobilemed: conta.idMobilemed,
                deMedicoIdMobilemed: de,
              }),
            );
          } catch (erro) {
            resultado = {
              status: 'falhou',
              motivo: 'erro_inesperado',
              detalhe: `Falha ao falar com a MobileMed: ${mensagemDo(erro)}`,
              retentavel: true,
            };
          }
        }
        await this.d.rodadas.registrarResultado(id, resultado, this.d.agora());
        await this.d.rodadas.registrarEvento(
          rodadaId,
          `Atribuindo: ${i + 1} de ${total}.`,
          this.d.agora(),
          { atual: i + 1, total },
        );
      }
      await this.fechar(rodadaId);
    } catch (erro) {
      const mensagem = mensagemDo(erro);
      await this.d.rodadas.mudar(rodadaId, STATUS_VIVOS, { status: 'falhou', erro: mensagem });
      this.d.nomesPacientes.limpar(rodadaId);
      await this.d.rodadas.registrarEvento(
        rodadaId,
        `A execução falhou: ${mensagem}`,
        this.d.agora(),
      );
    }
  }

  private async fechar(rodadaId: string): Promise<void> {
    const atual = await this.d.rodadas.obter(rodadaId);
    // Encerrada ou cancelada no meio: quem clicou já decidiu o desfecho.
    if (!atual || (atual.status !== 'executando' && atual.status !== 'pausada')) return;
    const c = await this.d.rodadas.contar(rodadaId);
    const status: StatusRodada = desfechoExecucao({
      restam: c.prevista,
      executadas: c.executada,
      falhas: c.falhou,
      retentaveis: c.retentaveis,
      pausada: atual.status === 'pausada',
    });
    const erro = status === 'falhou' ? `Nenhum exame foi atribuído: ${c.falhou} falha(s).` : null;
    if (status !== atual.status) {
      await this.d.rodadas.mudar(rodadaId, [atual.status], { status, erro });
    }
    if (!STATUS_VIVOS.includes(status)) this.d.nomesPacientes.limpar(rodadaId);
    const texto: Partial<Record<StatusRodada, string>> = {
      concluida: `Concluída: ${c.executada} exame(s) atribuído(s)${c.falhou ? `, ${c.falhou} falha(s)` : ''}.`,
      parcial: `${c.executada} atribuído(s); ${c.prevista + c.retentaveis} podem ser tentados de novo.`,
      falhou: `Encerrada sem atribuir nada (${c.falhou} falha(s)).`,
      pausada: `Pausada: ${c.executada} atribuído(s), ${c.prevista} por atribuir.`,
    };
    await this.d.rodadas.registrarEvento(rodadaId, texto[status] ?? status, this.d.agora());
  }
}
