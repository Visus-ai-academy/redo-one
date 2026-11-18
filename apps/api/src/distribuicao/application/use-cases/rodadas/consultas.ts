import type { FrenteEscala } from '../../../domain/arranjo';
import { montarEntrada, RECORTES_VAZIOS } from '../../../domain/rodada/entrada';
import type { StatusRodada } from '../../../domain/rodada/maquina';
import type {
  DesignacaoDetalhada,
  FiltroDesignacoes,
  Pagina,
  RodadaListada,
  RotuloRodada,
} from '../../ports/consulta-rodadas';
import type { ContagemDesignacoes, EventoRodada, Rodada } from '../../ports/rodadas.repository';
import { type AtorRodada, auditar, type DependenciasRodada, rodadaOuErro } from './comum';

/** Linhas do diário que a tela mostra. */
const EVENTOS_NO_DETALHE = 60;

export interface SituacaoRodada {
  id: string;
  status: StatusRodada;
  expiraEm: Date | null;
  erro: string | null;
  /** O último evento com barra (a execução); null fora dela. */
  progresso: EventoRodada | null;
  contagens: ContagemDesignacoes;
}

export interface RodadaDetalhe extends Rodada {
  solicitadaPor: RotuloRodada | null;
  aprovadaPor: RotuloRodada | null;
  contagens: ContagemDesignacoes;
  progresso: EventoRodada | null;
  eventos: EventoRodada[];
}

const progressoDe = (eventos: readonly EventoRodada[]) => {
  const ultimo = eventos.at(-1);
  return ultimo?.total != null ? ultimo : null;
};

/** O endpoint leve do polling (3–5 s, só com rodada ativa): status, progresso e contagens. */
export class ConsultarSituacao {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(id: string): Promise<SituacaoRodada> {
    const r = await rodadaOuErro(this.d, id);
    const [contagens, eventos] = await Promise.all([
      this.d.rodadas.contar(id),
      this.d.rodadas.eventos(id, 1),
    ]);
    return {
      id,
      status: r.status,
      expiraEm: r.expiraEm,
      erro: r.erro,
      progresso: progressoDe(eventos),
      contagens,
    };
  }
}

export class ConsultarRodada {
  constructor(private readonly d: DependenciasRodada) {}

  async porId(id: string): Promise<RodadaDetalhe> {
    return this.detalhe(await rodadaOuErro(this.d, id));
  }

  /** A rodada viva com o resumo; null = nenhuma. */
  async viva(): Promise<RodadaDetalhe | null> {
    await this.d.rodadas.expirarVencidas(this.d.agora());
    const r = await this.d.rodadas.viva();
    return r ? this.detalhe(r) : null;
  }

  async historico(pagina: number, porPagina: number): Promise<Pagina<RodadaListada>> {
    await this.d.rodadas.expirarVencidas(this.d.agora());
    return this.d.consulta.historico(pagina, porPagina);
  }

  private async detalhe(r: Rodada): Promise<RodadaDetalhe> {
    const usuarios = [r.solicitadaPorId, r.aprovadaPorId].filter((x): x is string => !!x);
    const [contagens, eventos, nomes] = await Promise.all([
      this.d.rodadas.contar(r.id),
      this.d.rodadas.eventos(r.id, EVENTOS_NO_DETALHE),
      this.d.consulta.nomesUsuarios(usuarios),
    ]);
    const rotulo = (id: string | null) => (id ? { id, nome: nomes.get(id) ?? '' } : null);
    return {
      ...r,
      solicitadaPor: rotulo(r.solicitadaPorId),
      aprovadaPor: rotulo(r.aprovadaPorId),
      contagens,
      progresso: progressoDe(eventos),
      eventos,
    };
  }
}

export interface DesignacaoComPaciente extends DesignacaoDetalhada {
  /** Lido na MobileMed agora, só com `distribuicao.paciente.ver`; null sem ela ou fora da fila. */
  nomePaciente: string | null; // LGPD: pessoal (nunca gravado)
}

/**
 * As designações da rodada, paginadas e filtradas. O nome do paciente só vem para quem tem a
 * permissão: é lido na porta da fila na hora (nunca do banco) e cada leitura é auditada.
 */
export class ListarDesignacoes {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(
    ator: AtorRodada,
    rodadaId: string,
    filtro: FiltroDesignacoes,
    comPaciente: boolean,
  ): Promise<Pagina<DesignacaoComPaciente>> {
    await rodadaOuErro(this.d, rodadaId);
    const pagina = await this.d.consulta.designacoes(rodadaId, filtro);
    let nomes = new Map<string, string>();
    if (comPaciente && pagina.itens.length) {
      nomes = await this.d.fila.nomesPacientes(pagina.itens.map((i) => i.idExameMobilemed));
      await auditar(this.d, ator, rodadaId, 'paciente_lido', {
        exames: pagina.itens.length,
        idsExame: pagina.itens.map((i) => i.idExameMobilemed),
      });
    }
    return {
      total: pagina.total,
      itens: pagina.itens.map((i) => ({
        ...i,
        nomePaciente: comPaciente ? (nomes.get(i.idExameMobilemed) ?? null) : null,
      })),
    };
  }
}

export interface ContagemFila {
  exames: number;
  urgentes: number;
}

export interface FilaDoMomento {
  lidaEm: Date;
  /** Exames NOVO sem médico. */
  total: number;
  urgentes: number;
  semCatalogo: number;
  semCliente: number;
  porPrioridade: ({ prioridadeOperacaoId: string | null; nome: string } & ContagemFila)[];
  porEspecialidade: ({ especialidadeId: string | null; nome: string } & ContagemFila)[];
  porModalidade: ({ modalidadeId: string | null; nome: string } & ContagemFila)[];
  medicosEmTurno: {
    medicoId: string;
    nome: string;
    alocacaoId: string;
    turnoId: string;
    frente: FrenteEscala;
    inicio: Date;
    fim: Date;
    produtividade: number | null;
    cargaEmMaos: number;
  }[];
}

/**
 * A fila agora, para a tela antes de distribuir: contagens por prioridade da operação e frente e
 * quem está em turno. Lê a porta da fila e as tabelas, sem gravar nada.
 */
export class ConsultarFilaDoMomento {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(): Promise<FilaDoMomento> {
    const agora = this.d.agora();
    const [leitura, { insumos, catalogo }] = await Promise.all([
      this.d.fila.ler(),
      this.d.insumos.carregar(agora),
    ]);
    const { entrada, lidos, semCatalogo, semCliente } = montarEntrada({
      agora,
      leitura,
      catalogo,
      insumos,
      entregas: { porExame: new Map(), cotaEntregue: {} },
      recortes: RECORTES_VAZIOS,
      pseudonimo: (t) => this.d.pseudonimizador.pseudonimo(t),
    });
    const novos = new Set(entrada.exames.filter((e) => e.novo).map((e) => e.id));
    const fila = lidos.filter((l) => novos.has(l.idExame));
    const nome = (id: string | null, semNome: string) => (id ? (insumos.nomes[id] ?? id) : semNome);
    const contar = (chave: (l: (typeof fila)[number]) => string | null) => {
      const mapa = new Map<string | null, ContagemFila>();
      for (const l of fila) {
        const k = chave(l);
        const c = mapa.get(k) ?? { exames: 0, urgentes: 0 };
        c.exames++;
        if (l.urgente) c.urgentes++;
        mapa.set(k, c);
      }
      return [...mapa].map(([id, c]) => ({ id, ...c }));
    };
    const carga = new Map(entrada.medicos.map((m) => [m.id, m.cargaEmMaos]));
    const nomeMedico = new Map(insumos.medicos.map((m) => [m.id, m.nome]));
    return {
      lidaEm: agora,
      total: fila.length,
      urgentes: fila.filter((l) => l.urgente).length,
      semCatalogo,
      semCliente,
      porPrioridade: contar((l) => l.prioridadeOperacaoId).map(({ id, ...c }) => ({
        prioridadeOperacaoId: id,
        nome: nome(id, 'Sem prioridade'),
        ...c,
      })),
      porEspecialidade: contar((l) => l.especialidadeId).map(({ id, ...c }) => ({
        especialidadeId: id,
        nome: nome(id, 'Sem especialidade'),
        ...c,
      })),
      porModalidade: contar((l) => l.modalidadeId).map(({ id, ...c }) => ({
        modalidadeId: id,
        nome: nome(id, 'Sem modalidade'),
        ...c,
      })),
      medicosEmTurno: insumos.ocorrencias
        .filter(
          (o) => !o.ausente && nomeMedico.has(o.medicoId) && o.inicio <= agora && agora < o.fim,
        )
        .map((o) => ({
          medicoId: o.medicoId,
          nome: nomeMedico.get(o.medicoId) ?? '',
          alocacaoId: o.alocacaoId,
          turnoId: o.turnoId,
          frente: o.frente,
          inicio: o.inicio,
          fim: o.fim,
          produtividade: o.produtividade,
          cargaEmMaos: carga.get(o.medicoId) ?? 0,
        })),
    };
  }
}
