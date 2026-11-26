import type { Tipificacao } from '../../faturamento/domain/tipificacao';
import type { ArquivoIngestao, ArquivosRepository } from '../application/ports/arquivos.repository';
import type { AvisosCadastroRepository } from '../application/ports/avisos-cadastro.repository';
import type {
  ImportacaoParaProcessar,
  ImportacoesRepository,
  ResultadoImportacao,
  StatusFinal,
} from '../application/ports/importacoes.repository';
import type {
  AlteracoesLaudos,
  ClienteDoLaudo,
  JanelaLaudos,
  LaudoParaRecalculo,
  LaudoParaReclassificacao,
  LaudosRepository,
  LoteRecalculo,
  ReclassificacaoLaudo,
} from '../application/ports/laudos.repository';
import type { FormatoPlanilha } from '../application/ports/leitor-planilha';
import type { PeriodoDias } from '../domain/periodo-mobilemed';
import type { LaudoExistente } from '../domain/planejar-importacao';
import type { LaudoPreparado, PacienteDoLaudo, PendenciaCadastro } from '../domain/preparar-laudo';

/** `Omit` que preserva a união. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Status = 'na_fila' | 'processando' | StatusFinal;

export class ImportacoesEmMemoria implements ImportacoesRepository {
  readonly itens = new Map<
    string,
    {
      fonte: DistributiveOmit<ImportacaoParaProcessar, 'id'>;
      status: Status;
      criadaEm: Date;
      enviadaPorId: string | null;
      resultado?: ResultadoImportacao;
    }
  >();

  constructor(private readonly arquivos?: ArquivosEmMemoria) {}

  criar(id: string, arquivoChave = `ingestao/${id}.xlsx`) {
    this.itens.set(id, {
      fonte: { origem: 'upload_manual', arquivoChave },
      status: 'na_fila',
      criadaEm: new Date(),
      enviadaPorId: null,
    });
  }

  async criarNaFila(dados: { arquivoId: string; enviadaPorId: string; agora: Date }) {
    const arquivo = this.arquivos?.itens.get(dados.arquivoId);
    if (arquivo) arquivo.enviadoEm = dados.agora;
    const id = crypto.randomUUID();
    this.criar(id, arquivo?.chave);
    return id;
  }

  async criarMobileMed(dados: {
    formatos: FormatoPlanilha[];
    periodo: PeriodoDias;
    enviadaPorId: string | null;
    agora: Date;
  }) {
    const emCurso = [...this.itens.values()].some(
      (i) =>
        i.fonte.origem === 'mobilemed' && (i.status === 'na_fila' || i.status === 'processando'),
    );
    if (emCurso) return null;
    return dados.formatos.map((formato) => {
      const id = crypto.randomUUID();
      this.itens.set(id, {
        fonte: { origem: 'mobilemed', formato, periodo: dados.periodo },
        status: 'na_fila',
        criadaEm: dados.agora,
        enviadaPorId: dados.enviadaPorId,
      });
      return id;
    });
  }

  /** As cargas do dashboards-one registradas (fora de `itens`, que só tem as que um job processa). */
  readonly cargas = new Map<
    string,
    { janela: PeriodoDias; status: Status; resultado?: ResultadoImportacao }
  >();

  async registrarCargaLegado(dados: { janela: PeriodoDias; agora: Date }) {
    const id = crypto.randomUUID();
    this.cargas.set(id, { janela: dados.janela, status: 'processando' });
    return id;
  }

  async ultimaMobileMedEm() {
    const datas = [...this.itens.values()]
      .filter((i) => i.fonte.origem === 'mobilemed')
      .map((i) => i.criadaEm.getTime());
    return datas.length ? new Date(Math.max(...datas)) : null;
  }

  async iniciar(id: string): Promise<ImportacaoParaProcessar | null> {
    const item = this.itens.get(id);
    if (!item || (item.status !== 'na_fila' && item.status !== 'processando')) return null;
    item.status = 'processando';
    return { id, ...item.fonte };
  }

  async finalizar(id: string, status: StatusFinal, resultado: ResultadoImportacao) {
    const item = this.itens.get(id) ?? this.cargas.get(id);
    if (item) Object.assign(item, { status, resultado });
  }
}

interface LaudoGuardado extends LaudoPreparado {
  removido: boolean;
  importacaoId: string;
}

export class LaudosEmMemoria implements LaudosRepository {
  readonly laudos = new Map<string, LaudoGuardado>();
  readonly linhasBrutas: { identidade: string; importacaoId: string }[] = [];
  /** `laudos_pacientes`, por identidade do laudo. */
  readonly pacientes = new Map<string, PacienteDoLaudo>();
  gravacoesPaciente = 0;
  /** Quantas vezes o recálculo leu um lote. */
  lotesLidos = 0;
  /** `classificacoes_laudo`, por identidade do laudo. */
  readonly classificacoes = new Map<string, Tipificacao>();

  private naJanela(l: LaudoGuardado, j: JanelaLaudos) {
    return (
      l.origem === j.origem &&
      l.diaLaudo >= j.inicio &&
      l.diaLaudo <= j.fim &&
      (!j.empresas || j.empresas.includes(l.empresaOrigem))
    );
  }

  async existentesNaJanela(j: JanelaLaudos) {
    const existentes = new Map<string, LaudoExistente>();
    for (const l of this.laudos.values()) {
      if (this.naJanela(l, j)) {
        existentes.set(l.identidade, {
          hashConteudo: l.hashConteudo,
          removido: l.removido,
          competencia: l.competencia,
          pacienteConferencia: this.pacientes.get(l.identidade)?.conferencia ?? null,
          medicoIdMobilemed: l.medicoIdMobilemed,
          medicoReassinaturaIdMobilemed: l.medicoReassinaturaIdMobilemed,
        });
      }
    }
    return existentes;
  }

  async aplicar(importacaoId: string, janela: JanelaLaudos, a: AlteracoesLaudos) {
    for (const l of [...a.inserir, ...a.atualizar]) {
      this.laudos.set(l.identidade, { ...l, removido: false, importacaoId });
      if (a.linhasBrutas.has(l.identidade)) {
        this.linhasBrutas.push({ identidade: l.identidade, importacaoId });
      }
    }
    for (const [identidade, ids] of a.idsMedico) {
      const l = this.laudos.get(identidade);
      if (!l) continue;
      l.medicoIdMobilemed = ids.medicoIdMobilemed ?? l.medicoIdMobilemed;
      l.medicoReassinaturaIdMobilemed =
        ids.medicoReassinaturaIdMobilemed ?? l.medicoReassinaturaIdMobilemed;
    }
    for (const [identidade, paciente] of a.pacientes) {
      if (!this.laudos.has(identidade)) continue;
      this.pacientes.set(identidade, paciente);
      this.gravacoesPaciente++;
    }
    for (const identidade of a.remover) {
      const l = this.laudos.get(identidade);
      if (l) l.removido = true;
    }
    for (const [identidade, { competencia, ...t }] of a.classificacoes) {
      const l = this.laudos.get(identidade);
      if (
        l &&
        l.competencia === competencia &&
        !janela.competenciasBloqueadas.includes(l.competencia)
      )
        this.classificacoes.set(identidade, t);
    }
  }

  async identidadesGravadas(identidades: string[]) {
    return new Set(identidades.filter((i) => this.laudos.has(i)));
  }

  async inserirNovos(
    importacaoId: string,
    a: Pick<AlteracoesLaudos, 'inserir' | 'linhasBrutas' | 'pacientes' | 'classificacoes'>,
  ) {
    let inseridos = 0;
    for (const l of a.inserir) {
      if (this.laudos.has(l.identidade)) continue;
      inseridos++;
      this.laudos.set(l.identidade, { ...l, removido: false, importacaoId });
      if (a.linhasBrutas.has(l.identidade))
        this.linhasBrutas.push({ identidade: l.identidade, importacaoId });
      const paciente = a.pacientes.get(l.identidade);
      if (paciente) this.pacientes.set(l.identidade, paciente);
      const t = a.classificacoes.get(l.identidade);
      if (t && t.competencia === l.competencia) {
        const { competencia: _, ...tipificacao } = t;
        this.classificacoes.set(l.identidade, tipificacao);
      }
    }
    return inseridos;
  }

  /** O id do laudo no fake é a identidade. */
  async lerParaRecalculo(lote: LoteRecalculo): Promise<LaudoParaRecalculo[]> {
    this.lotesLidos++;
    return [...this.laudos.values()]
      .filter(
        (l) =>
          (lote.depoisDe === null || l.identidade > lote.depoisDe) &&
          (lote.clienteIds === null ||
            (l.clienteId !== null && lote.clienteIds.includes(l.clienteId))) &&
          !lote.competenciasBloqueadas.includes(l.competencia),
      )
      .sort((a, b) => (a.identidade < b.identidade ? -1 : 1))
      .slice(0, lote.limite)
      .map((l) => ({
        id: l.identidade,
        clienteId: l.clienteId,
        dataRealizacao: l.dataRealizacao,
        dataLaudo: l.dataLaudo,
        competencia: l.competencia,
      }));
  }

  async lerParaReclassificacao(lote: LoteRecalculo): Promise<LaudoParaReclassificacao[]> {
    return [...this.laudos.values()]
      .filter(
        (l) =>
          (lote.depoisDe === null || l.identidade > lote.depoisDe) &&
          (lote.clienteIds === null ||
            (l.clienteId !== null && lote.clienteIds.includes(l.clienteId))) &&
          !lote.competenciasBloqueadas.includes(l.competencia),
      )
      .sort((a, b) => (a.identidade < b.identidade ? -1 : 1))
      .slice(0, lote.limite)
      .map((l) => ({
        id: l.identidade,
        empresaOrigem: l.empresaOrigem,
        clienteId: l.clienteId,
        unidadeId: l.unidadeId ?? null,
        modalidadeId: l.modalidadeId,
        especialidadeId: l.especialidadeId,
        prioridadeId: l.prioridadeId,
        medicoId: l.medicoId,
        competencia: l.competencia,
        tipificacao: this.classificacoes.get(l.identidade) ?? null,
      }));
  }

  async gravarReclassificacao(mudancas: ReclassificacaoLaudo[], bloqueadas: string[]) {
    for (const m of mudancas) {
      const l = this.laudos.get(m.id);
      if (!l || bloqueadas.includes(l.competencia)) continue;
      l.unidadeId = m.unidadeId;
      this.classificacoes.set(m.id, m.tipificacao);
    }
  }

  async gravarClientes(mudancas: ClienteDoLaudo[], bloqueadas: string[]) {
    for (const m of mudancas) {
      const l = this.laudos.get(m.id);
      if (!l || bloqueadas.includes(l.competencia)) continue;
      l.clienteId = m.clienteId;
      l.unidadeId = m.unidadeId;
    }
  }

  async atualizarCompetencias(mudancas: { id: string; competencia: string }[]) {
    for (const { id, competencia } of mudancas) {
      const l = this.laudos.get(id);
      if (l) l.competencia = competencia;
    }
  }

  ativos() {
    return [...this.laudos.values()].filter((l) => !l.removido);
  }
}

export class AvisosEmMemoria implements AvisosCadastroRepository {
  readonly chamadas: {
    pendencias: (PendenciaCadastro & { ocorrencias: number })[];
    conferidos: { tipo: string; chave: string }[];
  }[] = [];

  async registrar(
    _importacaoId: string,
    pendencias: (PendenciaCadastro & { ocorrencias: number })[],
    conferidos: { tipo: string; chave: string }[],
  ) {
    this.chamadas.push({ pendencias, conferidos });
  }
}

export class ArquivosEmMemoria implements ArquivosRepository {
  readonly itens = new Map<string, ArquivoIngestao>();

  async criar(dados: {
    chave: string;
    nomeOriginal: string;
    tamanhoBytes: number;
    criadoPorId: string;
  }) {
    const id = crypto.randomUUID();
    this.itens.set(id, { id, ...dados, enviadoEm: null });
    return id;
  }

  async obter(id: string) {
    return this.itens.get(id) ?? null;
  }
}
