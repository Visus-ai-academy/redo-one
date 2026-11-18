import type {
  AtribuidorExames,
  PedidoAtribuicao,
  ResultadoAtribuicao,
} from '../../application/ports/atribuidor-exames';
import type {
  ExameComDono,
  ExameDaFila,
  ExameEmMaos,
  FilaExames,
  LeituraFila,
} from '../../application/ports/fila-exames';
import { type ClienteMobileMed, ErroMobileMed } from './cliente-mobilemed';
import {
  type ExameMobileMed,
  type ItemListaMobileMed,
  PRIORIDADES_MOBILEMED,
  respostaExame,
  respostaListaExames,
  respostaMedicosUnidade,
  respostaQualquer,
  STATUS_ASSINADOS,
  STATUS_MOBILEMED,
  STATUS_NAO_LAUDADOS,
  STATUS_NOVO,
} from './esquemas-mobilemed';

export interface OpcoesMobileMedReal {
  /** Exames por página no `POST /exame/lista` (`MOBILEMED_PAGINA`). */
  porPagina: number;
  /** Acima disso a leitura recusa (filtro ignorado pela MobileMed traria o histórico inteiro). */
  maximoExames: number;
}

export interface MedicoDaUnidade {
  /** Conta na MobileMed (`medicos.id_mobilemed`). */
  id: number;
  nome: string;
}

/** Filtro da lista como o portal monta (`exameModel.filtroExames`), sem limite de data. */
const filtroLista = (f: {
  medicos: number[];
  pagina: number;
  porPagina: number;
  status?: readonly number[];
  idExame?: number;
}) => ({
  exames: {
    filtro: {
      is_excluido: false,
      modalidades: [],
      prioridades: [],
      medicos: f.medicos,
      empresas: [],
      pesquisa: '',
      nome_paciente: '',
      codigo_paciente: '',
      estudo_descricao: '',
      interessante_motivo: '',
      is_audio: false,
      is_no_audio: false,
      is_comentario: false,
      is_interessante: false,
      is_imagem_chave: false,
      is_anexo: false,
      is_anexo_exame: false,
      is_imagens_capturadas: false,
      is_duplicado: false,
      is_original: false,
      is_anterior: false,
      is_complementar: null,
      is_achado_critico: false,
      is_suspeita_tecnica: false,
      is_ia: null,
      sexo_paciente_id: null,
      exibirExamesPendentes: false,
      exibirExamesAPreparar: false,
      exibirExamesReconvocados: false,
      exibirPaginacao: null,
      periodo: { data_inicial: '', data_final: '' },
      transferencia: { data_inicial_transferencia: '', data_final_transferencia: '' },
      tipo_tempo: null,
      tipo_exame: 1,
      is_listagem_preparacao: null,
      is_listagem_transferencia: null,
      is_crescente: false,
      pacs_accession_no: null,
      convenio: null,
      aniversario_paciente: null,
      medico_solicitante: null,
      email_solicitante: null,
      listagem_id: 2,
      identidade_paciente: '',
      isSolicitante: false,
      email_usuario: '',
      tipo_listagem: 1,
      array_prioridade: [],
      array_status_id: f.status ? [...f.status] : null,
      limpar_data: true,
      is_equipe_medica: false,
      pesquisa_geral: '',
      pesquisa_id_exame: f.idExame ?? null,
    },
    paginacao: { pagina: f.pagina, total_registros: f.porPagina },
  },
  filtroContagem: {},
});

const inesperada = (mensagem: string) => new ErroMobileMed('resposta_inesperada', mensagem);

const prioridadeDe = (e: ItemListaMobileMed): string | null => {
  if (e.prioridade_id === null || e.prioridade_id === undefined) return null;
  const grafia = PRIORIDADES_MOBILEMED[e.prioridade_id];
  if (!grafia) {
    throw inesperada(
      `MobileMed: prioridade_id ${e.prioridade_id} desconhecida na fila; a leitura foi descartada inteira.`,
    );
  }
  return grafia;
};

const statusDe = (statusId: number): string => {
  const status = STATUS_MOBILEMED[statusId];
  if (!status) {
    throw inesperada(
      `MobileMed: status_id ${statusId} desconhecido na fila; a leitura foi descartada inteira.`,
    );
  }
  return status;
};

const paraExameDaFila = (e: ItemListaMobileMed): ExameDaFila => ({
  idExame: String(e.id),
  prioridade: prioridadeDe(e),
  estudo: e.estudo_descricao,
  unidade: e.nome_fantasia,
  modalidade: e.modalidade,
  // shortcut: a especialidade só vem como `subespecialidade_id`; o catálogo decide pelo estudo
  // até o HAR mostrar o formato (`docs/integracao-mobilemed.md`, 5.4).
  especialidade: null,
  laudos: null,
  realizadoEm: e.data_realizacao,
  entradaEm: e.data_transferencia_final ?? e.data_realizacao,
  prazo: e.sla_expiration_date ?? null,
  status: statusDe(e.status_id),
  paciente: {
    codigo:
      e.codigo_paciente === null || e.codigo_paciente === undefined
        ? null
        : String(e.codigo_paciente),
    nome: e.nome_paciente,
  },
});

/**
 * Flags de SLA do `PUT /exame` quando o médico muda: porte fiel de `definirFlagsResetSla` do portal
 * (`mobile.js:68850`). É regra da MobileMed, não nossa: `is_shared_exam` e
 * `is_user_in_origin_unit` são calculados pelo front do mesmo jeito.
 */
export const flagsResetSla = (e: ExameMobileMed, novo: number | null) => {
  const flags = { alterarSla: false, alterarSlaEmpresaCompartilhada: false };
  const atual = e.usuario_id;
  if (!(atual || novo) || atual === novo) return flags;
  const compartilhado = (e.compartilhamentos?.length ?? 0) > 0;
  const naOrigem = compartilhado && (e.permissao?.length ?? 0) > 0;
  if (naOrigem && e.empresa.permissao_sla_medico) flags.alterarSla = true;
  if (!naOrigem && compartilhado) {
    const c = e.compartilhamentos?.find(
      // O portal compara com `==`: null e ausente são iguais.
      (x) =>
        ((x.empresa_destino?.id || x.empresa_compartilhada_id) ?? null) ===
        (e.sla_empresa_id ?? null),
    );
    if (c && (c.permissao_sla_medico || c.empresa_destino?.permissao_sla_medico)) {
      flags.alterarSlaEmpresaCompartilhada = true;
    }
  }
  return flags;
};

const pulada = (motivo: string, detalhe: string): ResultadoAtribuicao => ({
  status: 'pulada',
  motivo,
  detalhe: `MobileMed: ${detalhe}`,
  retentavel: false,
});

/** A falha de uma chamada como resultado da atribuição (o motivo diz se vale tentar de novo). */
const falhaDe = (erro: unknown): ResultadoAtribuicao => {
  if (!(erro instanceof ErroMobileMed)) throw erro;
  const porTipo = {
    sessao: { motivo: 'sessao_caiu', retentavel: true },
    indisponivel: { motivo: 'mobilemed_indisponivel', retentavel: true },
    resposta_inesperada: { motivo: 'resposta_inesperada', retentavel: false },
    recusada: { motivo: 'recusada_mobilemed', retentavel: false },
  } as const;
  return { status: 'falhou', ...porTipo[erro.tipo], detalhe: erro.message };
};

/**
 * MobileMed de verdade, pelas rotas internas do portal (`docs/integracao-mobilemed.md`): lê a fila
 * por `POST /exame/lista` e atribui, troca ou tira o médico por `PUT /exame` com o corpo mínimo,
 * conferindo o exame antes e relendo depois. Só liga com `DISTRIBUICAO_MOBILEMED=real`.
 */
export class MobileMedReal implements FilaExames, AtribuidorExames {
  /** Leituras que chegam juntas (tela e job) dividem a mesma ida à MobileMed. */
  private leituraEmCurso: Promise<LeituraFila> | null = null;

  constructor(
    private readonly cliente: ClienteMobileMed,
    private readonly o: OpcoesMobileMedReal,
  ) {}

  ler(): Promise<LeituraFila> {
    this.leituraEmCurso ??= this.lerAgora().finally(() => {
      this.leituraEmCurso = null;
    });
    return this.leituraEmCurso;
  }

  private async lerAgora(): Promise<LeituraFila> {
    const semMedico = await this.lerTudo({ medicos: [0] });
    const comMedico = await this.lerTudo({ medicos: [], status: STATUS_NAO_LAUDADOS });
    return {
      // Inclui o aberto sem médico (Laudando, Pré-laudado...): só o NOVO é distribuído, mas o
      // aberto prende o pacote do paciente.
      semMedico: semMedico.filter((e) => e.usuario_id === null).map(paraExameDaFila),
      emMaos: comMedico
        .filter((e) => e.usuario_id !== null && !STATUS_ASSINADOS.includes(e.status_id))
        .map(
          (e): ExameEmMaos => ({
            ...paraExameDaFila(e),
            medicoIdMobilemed: e.usuario_id as number,
          }),
        ),
    };
  }

  /** Todas as páginas, ou nada: a soma tem que bater com `paginacao.total`. */
  private async lerTudo(f: {
    medicos: number[];
    status?: readonly number[];
  }): Promise<ItemListaMobileMed[]> {
    const itens: ItemListaMobileMed[] = [];
    let total: number | null = null;
    for (let pagina = 1; ; pagina++) {
      const r = await this.cliente.chamar(
        'POST',
        '/exame/lista',
        respostaListaExames,
        filtroLista({ ...f, pagina, porPagina: this.o.porPagina }),
      );
      if (total === null) {
        total = r.paginacao.total;
        if (total > this.o.maximoExames) {
          throw inesperada(
            `MobileMed: a lista trouxe ${total} exame(s), acima do máximo de ${this.o.maximoExames}; a leitura foi recusada.`,
          );
        }
      } else if (r.paginacao.total !== total) {
        throw inesperada('MobileMed: a fila mudou durante a leitura; leia de novo.');
      }
      itens.push(...r.lista);
      if (pagina >= r.paginacao.last_page) break;
      if (!r.lista.length || itens.length >= total) {
        throw inesperada('MobileMed: a paginação da lista não fechou; a leitura foi descartada.');
      }
    }
    if (itens.length !== total) {
      throw inesperada(
        `MobileMed: a leitura trouxe ${itens.length} de ${total} exame(s); nada foi usado.`,
      );
    }
    return itens;
  }

  async nomesPacientes(idsExame: readonly string[]): Promise<Map<string, string>> {
    const nomes = new Map<string, string>();
    for (const idExame of new Set(idsExame)) {
      if (!/^\d+$/.test(idExame)) continue;
      const r = await this.cliente.chamar(
        'POST',
        '/exame/lista',
        respostaListaExames,
        filtroLista({ medicos: [], pagina: 1, porPagina: 5, idExame: Number(idExame) }),
      );
      const exame = r.lista.find((e) => e.id === Number(idExame));
      if (exame && !STATUS_ASSINADOS.includes(exame.status_id)) {
        nomes.set(idExame, exame.nome_paciente);
      }
    }
    return nomes;
  }

  async intocados(exames: readonly ExameComDono[]): Promise<Set<string>> {
    const intocados = new Set<string>();
    for (const e of exames) {
      try {
        const atual = await this.exame(e.idExame);
        if (atual?.status_id === STATUS_NOVO && atual.usuario_id === e.medicoIdMobilemed) {
          intocados.add(e.idExame);
        }
      } catch (erro) {
        if (!(erro instanceof ErroMobileMed)) throw erro;
        // A atribuição reconfere o exame e devolve a falha como retentável.
        intocados.add(e.idExame);
      }
    }
    return intocados;
  }

  atribuir(pedido: PedidoAtribuicao): Promise<ResultadoAtribuicao> {
    return this.mudarMedico(pedido.idExame, pedido.deMedicoIdMobilemed, pedido.medicoIdMobilemed);
  }

  /** Devolve o exame à fila (sem médico), se ele segue NOVO com `deMedicoIdMobilemed`. */
  tirar(idExame: string, deMedicoIdMobilemed: number): Promise<ResultadoAtribuicao> {
    return this.mudarMedico(idExame, deMedicoIdMobilemed, null);
  }

  /** Médicos da unidade com conta na MobileMed (para o de-para de `medicos.id_mobilemed`). */
  async medicosDaUnidade(empresaId: number): Promise<MedicoDaUnidade[]> {
    const r = await this.cliente.chamar('POST', '/usuario/lista/empresa', respostaMedicosUnidade, {
      filtro: {
        textoPesquisa: '',
        empresa_id: empresaId,
        is_excluido: false,
        perfis: [3],
        is_ativo: true,
        grupo_id: 0,
      },
    });
    return r.lista;
  }

  private async exame(idExame: string): Promise<ExameMobileMed | null> {
    if (!/^\d+$/.test(idExame)) return null;
    try {
      const r = await this.cliente.chamar('GET', `/exame/${idExame}`, respostaExame);
      return r.exame ?? null;
    } catch (erro) {
      if (erro instanceof ErroMobileMed && erro.status === 404) return null;
      throw erro;
    }
  }

  private async mudarMedico(
    idExame: string,
    de: number | null,
    para: number | null,
  ): Promise<ResultadoAtribuicao> {
    if (this.cliente.freado) {
      return {
        status: 'falhou',
        motivo: 'freio_mobilemed',
        detalhe:
          'MobileMed: parado depois de anomalias seguidas (indisponível ou resposta fora do formato); tente de novo ao retomar.',
        retentavel: true,
      };
    }
    try {
      const exame = await this.exame(idExame);
      if (!exame) return pulada('saiu_da_fila', 'o exame não foi encontrado.');
      // Nova tentativa depois de uma confirmação que falhou: já está como pedido.
      if (exame.usuario_id === para && exame.status_id === STATUS_NOVO) {
        return { status: 'executada' };
      }
      if (STATUS_ASSINADOS.includes(exame.status_id)) {
        return pulada('assinado', 'o exame já foi assinado.');
      }
      if (de === null && exame.usuario_id !== null) {
        return pulada('ja_tem_medico', 'o exame já tem médico.');
      }
      if (de !== null && exame.usuario_id !== de) {
        return pulada('mudou_de_dono', 'o exame trocou de médico desde que foi lido.');
      }
      if (exame.status_id !== STATUS_NOVO) {
        return pulada('exame_ja_aberto', 'o exame já foi aberto (não está mais NOVO).');
      }
      if (exame.empresa.exigir_motivo) {
        // Decisão: o One não inventa motivo; a operação atribui à mão na MobileMed.
        return pulada('unidade_exige_motivo', 'a unidade exige motivo; atribua à mão.');
      }
      await this.cliente.chamar('PUT', '/exame', respostaQualquer, {
        exame: {
          id: exame.id,
          // O portal manda 0 para tirar o médico pela lista ("Atribuir exames ao médico").
          usuario_id: para ?? 0,
          is_complementar: exame.is_complementar,
          is_duplicado: exame.is_duplicado,
          is_original: exame.is_original,
          ...flagsResetSla(exame, para),
        },
      });
      const gravado = await this.exame(idExame);
      if (gravado?.usuario_id !== para) {
        return {
          status: 'falhou',
          motivo: 'nao_confirmado',
          detalhe: 'MobileMed: a troca de médico não apareceu ao reler o exame.',
          retentavel: true,
        };
      }
      return { status: 'executada' };
    } catch (erro) {
      return falhaDe(erro);
    }
  }
}
