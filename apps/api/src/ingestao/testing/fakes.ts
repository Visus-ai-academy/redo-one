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
  JanelaLaudos,
  LaudosRepository,
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
    const item = this.itens.get(id);
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

  private naJanela(l: LaudoGuardado, j: JanelaLaudos) {
    return (
      l.origem === j.origem &&
      l.diaLaudo >= j.inicio &&
      l.diaLaudo <= j.fim &&
      (!j.empresas || j.empresas.includes(l.empresaOrigem)) &&
      !j.competenciasBloqueadas.includes(l.competencia)
    );
  }

  async existentesNaJanela(j: JanelaLaudos) {
    const existentes = new Map<string, LaudoExistente>();
    for (const l of this.laudos.values()) {
      if (this.naJanela(l, j)) {
        existentes.set(l.identidade, {
          hashConteudo: l.hashConteudo,
          removido: l.removido,
          pacienteConferencia: this.pacientes.get(l.identidade)?.conferencia ?? null,
          medicoIdMobilemed: l.medicoIdMobilemed,
          medicoReassinaturaIdMobilemed: l.medicoReassinaturaIdMobilemed,
        });
      }
    }
    return existentes;
  }

  async aplicar(importacaoId: string, _janela: JanelaLaudos, a: AlteracoesLaudos) {
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
