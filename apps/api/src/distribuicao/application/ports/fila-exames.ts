export const FILA_EXAMES = Symbol('FILA_EXAMES');

/**
 * O paciente como a MobileMed o mostra. Vive só na memória da leitura: vira HMAC antes de qualquer
 * gravação, e o nome só aparece na conferência para quem tem `distribuicao.paciente.ver`.
 */
export interface PacienteDaFila {
  /** Código do paciente na MobileMed; null quando a fila não traz. */
  codigo: string | null; // LGPD: saúde (identifica o paciente)
  nome: string; // LGPD: pessoal
}

/** Um exame da fila "sem médico" da MobileMed, como chega (texto cru, sem casar com o catálogo). */
export interface ExameDaFila {
  /** Id do exame na MobileMed: a atribuição vai direto a ele. */
  idExame: string;
  /** Grafia da prioridade na MobileMed (Rotina, Urgência, P1…); null = sem prioridade. */
  prioridade: string | null;
  /** Nome do estudo (casa com o catálogo de exames). */
  estudo: string;
  /** Unidade (empresa) na MobileMed: casa com o cliente pelos apelidos. */
  unidade: string;
  modalidade: string | null;
  especialidade: string | null;
  /** Quantidade de laudos do registro; null = 1. */
  laudos: number | null;
  realizadoEm: Date;
  /** Quando entrou na fila (transferência). */
  entradaEm: Date;
  /** Prazo (SLA) da MobileMed; null = desconhecido. */
  prazo: Date | null;
  /** Status na MobileMed (só o NOVO é distribuído). */
  status: string;
  paciente: PacienteDaFila;
}

/**
 * Exame que já está com um médico e ainda não foi laudado: carga em mãos, aderência e o
 * recolhimento (o NOVO entregue pelo robô a quem saiu do turno volta para a rodada).
 */
export interface ExameEmMaos {
  idExame: string;
  /** Conta do médico na MobileMed (`medicos.id_mobilemed`). */
  medicoIdMobilemed: number;
  /** Status na MobileMed: NOVO = o médico ainda não abriu (só esse é recolhido). */
  status: string;
  prioridade: string | null;
  estudo: string;
  unidade: string;
  modalidade: string | null;
  especialidade: string | null;
  laudos: number | null;
  realizadoEm: Date;
  entradaEm: Date;
  prazo: Date | null;
  paciente: PacienteDaFila;
}

/** O exame e com quem a rodada o viu: null = sem médico. */
export interface ExameComDono {
  idExame: string;
  medicoIdMobilemed: number | null;
}

export interface LeituraFila {
  semMedico: ExameDaFila[];
  emMaos: ExameEmMaos[];
}

/**
 * Leitura da fila da MobileMed. Até o mapeamento da API da MobileMed (TODO.md, "Integração com a
 * MobileMed"), o adaptador é a fila sintética (`infrastructure/mobilemed`).
 *
 * TODO(adaptador real): `POST /exame/lista` com o filtro "sem médico" (e a lista dos exames com
 * médico ainda não laudados, para a carga em mãos), login com TOTP e renovação do token, e a
 * mensagem de erro dizendo que a falha veio da MobileMed. Depende do mapeamento da API.
 */
export interface FilaExames {
  ler(): Promise<LeituraFila>;
  /**
   * Nome do paciente de cada exame (sem médico ou com médico e não laudado), lido na MobileMed agora
   * (nunca do banco). Só para a conferência, com permissão e auditoria; exame laudado não volta no
   * mapa.
   */
  nomesPacientes(idsExame: readonly string[]): Promise<Map<string, string>>;
  /**
   * Dos exames pedidos, os que seguem NOVO e com o mesmo dono de quando a rodada os leu (sem médico,
   * ou o médico de quem foram recolhidos). A retomada confere antes de atribuir cada um: o que
   * mudou de mão por fora é pulado.
   */
  intocados(exames: readonly ExameComDono[]): Promise<Set<string>>;
}
