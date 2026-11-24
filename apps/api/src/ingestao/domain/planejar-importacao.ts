export interface LaudoExistente {
  hashConteudo: string;
  removido: boolean;
  /** Competência gravada ("YYYY-MM"). */
  competencia?: string;
  /** Conferência do paciente gravado (`PacienteDoLaudo.conferencia`); nulo = sem paciente. */
  pacienteConferencia?: string | null;
  /** Conta MobileMed de quem assinou e reassinou, gravada (fora do hash). */
  medicoIdMobilemed?: number | null;
  medicoReassinaturaIdMobilemed?: number | null;
}

/** Trava contra arquivo truncado (valores de `parametros_ingestao`). */
export interface TravaRemocao {
  minimo: number;
  fator: number;
}

/** O que a importação não pode mexer (fechadas ou com a importação travada). */
export interface BloqueioImportacao {
  competencias: ReadonlySet<string>;
  /**
   * Identidades das linhas deixadas de fora porque a competência calculada está bloqueada: o laudo
   * gravado com essa identidade fica como está (não é removido).
   */
  identidadesIgnoradas: ReadonlySet<string>;
}

const SEM_BLOQUEIO: BloqueioImportacao = {
  competencias: new Set(),
  identidadesIgnoradas: new Set(),
};

export interface PlanoImportacao<L> {
  inserir: L[];
  atualizar: L[];
  inalterados: number;
  /** Identidades da janela que não vieram no arquivo. */
  remover: string[];
  /**
   * Laudos cujo paciente (nome e código) tem de ser gravado: o novo, o que ainda não tinha e o
   * que mudou, mesmo com o resto do laudo igual (o paciente fica fora do hash do conteúdo).
   */
  pacientes: L[];
  /**
   * Laudos iguais (fora do inserir e do atualizar) cujo id da conta MobileMed do médico veio e
   * falta ou difere do gravado: só esses ids são gravados (o upload, que não os traz, não apaga).
   */
  idsMedico: L[];
  /** Linhas repetidas na própria planilha (mesma identidade): contam uma vez. */
  repetidas: number;
  /** Linhas cujo laudo gravado está em competência bloqueada: o gravado fica como está. */
  ignoradasBloqueada: number;
  /** Motivo da recusa; com recusa, nada é gravado. */
  recusa: string | null;
}

type IdsMedico = {
  medicoIdMobilemed?: number | null;
  medicoReassinaturaIdMobilemed?: number | null;
};

/** Algum id da conta MobileMed veio e falta ou difere do gravado. */
const idMedicoNovo = (laudo: IdsMedico, existente: IdsMedico) =>
  (['medicoIdMobilemed', 'medicoReassinaturaIdMobilemed'] as const).some(
    (campo) => laudo[campo] != null && laudo[campo] !== existente[campo],
  );

/**
 * Compara os laudos do arquivo com os da janela que ele cobre: novos entram, os de conteúdo
 * diferente (ou que tinham sido removidos) são atualizados e os que não vieram são removidos.
 * Laudo gravado em competência bloqueada nunca muda nem é removido, e o das linhas ignoradas por
 * competência calculada bloqueada também não é removido.
 * Recusa quando sumiria muito mais do que o arquivo traz (arquivo incompleto), como a trava do
 * dashboards-one (`substituicaoSuspeita`).
 */
export function planejarImportacao<
  L extends {
    identidade: string;
    hashConteudo: string;
    paciente?: { conferencia: string } | null;
    medicoIdMobilemed?: number | null;
    medicoReassinaturaIdMobilemed?: number | null;
  },
>(
  laudos: L[],
  existentes: ReadonlyMap<string, LaudoExistente>,
  trava: TravaRemocao,
  bloqueio: BloqueioImportacao = SEM_BLOQUEIO,
): PlanoImportacao<L> {
  const gravadoBloqueado = (e: LaudoExistente) =>
    e.competencia !== undefined && bloqueio.competencias.has(e.competencia);
  const vistos = new Set<string>();
  const plano: PlanoImportacao<L> = {
    inserir: [],
    atualizar: [],
    inalterados: 0,
    remover: [],
    pacientes: [],
    idsMedico: [],
    repetidas: 0,
    ignoradasBloqueada: 0,
    recusa: null,
  };

  for (const laudo of laudos) {
    if (vistos.has(laudo.identidade)) {
      plano.repetidas++;
      continue;
    }
    vistos.add(laudo.identidade);
    const existente = existentes.get(laudo.identidade);
    if (existente && gravadoBloqueado(existente)) {
      plano.ignoradasBloqueada++;
      continue;
    }
    if (!existente) plano.inserir.push(laudo);
    else if (existente.removido || existente.hashConteudo !== laudo.hashConteudo) {
      plano.atualizar.push(laudo);
    } else {
      plano.inalterados++;
      if (idMedicoNovo(laudo, existente)) plano.idsMedico.push(laudo);
    }
    if (laudo.paciente && laudo.paciente.conferencia !== existente?.pacienteConferencia) {
      plano.pacientes.push(laudo);
    }
  }

  for (const [identidade, existente] of existentes) {
    if (
      !existente.removido &&
      !vistos.has(identidade) &&
      !bloqueio.identidadesIgnoradas.has(identidade) &&
      !gravadoBloqueado(existente)
    ) {
      plano.remover.push(identidade);
    }
  }

  const removidos = plano.remover.length;
  if (removidos > trava.minimo && removidos > trava.fator * vistos.size) {
    const linhas = `${vistos.size} linha${vistos.size === 1 ? '' : 's'}`;
    plano.recusa = `O arquivo removeria ${removidos} laudos da janela com só ${linhas}: parece incompleto. Nada foi alterado.`;
  }
  return plano;
}
