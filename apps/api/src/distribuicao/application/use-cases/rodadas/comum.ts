import type { Auditoria } from '../../../../auditoria/auditoria';
import { CONFIGURACAO_INICIAL, type ConfiguracaoGlobal } from '../../../domain/configuracao-global';
import { type RecorteForaDoEscopoError, rodadaNoEscopo } from '../../../domain/rodada/escopo';
import type { AtribuidorExames } from '../../ports/atribuidor-exames';
import type { AvisosClienteInativo } from '../../ports/avisos-cliente-inativo';
import type { AvisosContaUnidade } from '../../ports/avisos-conta-unidade';
import type { AvisosPrioridade } from '../../ports/avisos-prioridade';
import type { ConfiguracaoDistribuicaoRepository } from '../../ports/configuracao-distribuicao.repository';
import type { ConsultaRodadas } from '../../ports/consulta-rodadas';
import type { ContasPorUnidade } from '../../ports/contas-por-unidade';
import type { FilaExames } from '../../ports/fila-exames';
import type {
  EscalaRecolhimento,
  EscopoRodada,
  LeitorInsumosRodada,
  MedicosRodada,
  PseudonimizadorPaciente,
} from '../../ports/insumos-rodada';
import type { NomesPacientesRodada } from '../../ports/nomes-pacientes-rodada';
import type { PrioridadesClienteRepository } from '../../ports/prioridades-cliente.repository';
import type { Rodada, RodadasRepository } from '../../ports/rodadas.repository';
import { RodadaNaoEncontradaError } from './erros';

/** Tudo de que os casos de uso da rodada dependem (portas e relógio). */
export interface DependenciasRodada {
  rodadas: RodadasRepository;
  consulta: ConsultaRodadas;
  fila: FilaExames;
  atribuidor: AtribuidorExames;
  /** Contas liberadas por unidade na MobileMed (memória entre rodadas), para a proposta. */
  contasUnidade: ContasPorUnidade;
  insumos: LeitorInsumosRodada;
  escalaRecolhimento: EscalaRecolhimento;
  medicos: MedicosRodada;
  escopo: EscopoRodada;
  configuracao: ConfiguracaoDistribuicaoRepository;
  prioridadesCliente: PrioridadesClienteRepository;
  pseudonimizador: PseudonimizadorPaciente;
  /** Grafia de prioridade sem de-para vira aviso em Operação › Avisos. */
  avisosPrioridade: AvisosPrioridade;
  /** Médico escalado sem conta liberada na unidade do exame vira aviso em Operação › Avisos. */
  avisosContaUnidade: AvisosContaUnidade;
  /** Cliente inativo com exames na fila vira aviso em Operação › Avisos (um por cliente). */
  avisosClienteInativo: AvisosClienteInativo;
  /** Nomes dos pacientes da leitura, só em memória, para a conferência. */
  nomesPacientes: NomesPacientesRodada;
  auditoria: Auditoria;
  agora: () => Date;
}

/** Quem age na rodada pela tela: o recorte da gestora vale para quem não tem acesso total. */
export interface AtorRodada {
  usuarioId: string;
  acessoTotal: boolean;
}

export const ENTIDADE_AUDITORIA = 'rodada_distribuicao';

export async function configuracaoAtual(
  d: Pick<DependenciasRodada, 'configuracao'>,
): Promise<ConfiguracaoGlobal> {
  return (await d.configuracao.obter()) ?? CONFIGURACAO_INICIAL;
}

export async function escopoDo(d: Pick<DependenciasRodada, 'escopo'>, ator: AtorRodada) {
  return ator.acessoTotal ? null : d.escopo.doUsuario(ator.usuarioId);
}

/** A rodada, com a proposta vencida já marcada como expirada. */
export async function rodadaOuErro(d: DependenciasRodada, id: string): Promise<Rodada> {
  await d.rodadas.expirarVencidas(d.agora());
  const r = await d.rodadas.obter(id);
  if (!r) throw new RodadaNaoEncontradaError();
  return r;
}

/** A gestora com recorte só mexe na rodada que cabe nele. */
export async function exigirNoEscopo(
  d: DependenciasRodada,
  ator: AtorRodada,
  r: Rodada,
  Erro: typeof RecorteForaDoEscopoError,
): Promise<void> {
  if (!rodadaNoEscopo(await escopoDo(d, ator), r.recortes)) {
    throw new Erro('Esta rodada sai do seu recorte na escala: peça a quem tem acesso a ela.');
  }
}

export async function auditar(
  d: DependenciasRodada,
  ator: AtorRodada | null,
  rodadaId: string,
  acao: string,
  depois?: Record<string, unknown>,
): Promise<void> {
  await d.auditoria.registrar({
    ator: ator ? { tipo: 'usuario', id: ator.usuarioId } : { tipo: 'sistema' },
    entidade: ENTIDADE_AUDITORIA,
    entidadeId: rodadaId,
    acao,
    ...(depois ? { depois } : {}),
    em: d.agora(),
  });
}

/** Mensagem curta do erro para o diário (as portas não põem dado de paciente nas mensagens). */
export const mensagemDo = (erro: unknown) =>
  (erro instanceof Error ? erro.message : String(erro)).slice(0, 300);
