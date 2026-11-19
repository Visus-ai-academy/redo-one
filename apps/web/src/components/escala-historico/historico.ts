// Apresentação dos eventos do Histórico da escala: o que aconteceu e o que mudou, em português.
// Rótulos de referência: `logEscala.ts` do dashboards-one.

import type { AtorHistoricoDto } from '../../gen/types/AtorHistoricoDto';
import type { EntidadeEscalaKey } from '../../gen/types/EntidadeEscala';

type Genero = 'f' | 'm';

/** Entidades do histórico, na ordem do filtro "O quê". */
export const ENTIDADES_HISTORICO: Record<EntidadeEscalaKey, { rotulo: string; genero: Genero }> = {
  alocacao: { rotulo: 'Alocação', genero: 'f' },
  ajuste_produtividade: { rotulo: 'Ajuste de produtividade', genero: 'm' },
  ajuste_dia_distribuicao: { rotulo: 'Ajuste do robô no dia', genero: 'm' },
  ausencia: { rotulo: 'Ausência', genero: 'f' },
  turno: { rotulo: 'Turno', genero: 'm' },
  frente_escala: { rotulo: 'Frente', genero: 'f' },
  tipo_ausencia: { rotulo: 'Tipo de ausência', genero: 'm' },
  escopo_escala: { rotulo: 'Recorte da escala', genero: 'm' },
};

/** Radical do particípio (a API grava no masculino ou no feminino) → como se escreve. */
const PARTICIPIOS: Record<string, string> = {
  criad: 'criad',
  alterad: 'alterad',
  excluid: 'excluíd',
  aprovad: 'aprovad',
  recusad: 'recusad',
  solicitad: 'solicitad',
  cancelad: 'cancelad',
  encerrad: 'encerrad',
  definid: 'definid',
};

const entidadeConhecida = (entidade: string) =>
  (ENTIDADES_HISTORICO as Record<string, { rotulo: string; genero: Genero }>)[entidade];

/** "Alocação criada", "Ausência aprovada", "Turno alterado". */
export function descreverEvento(entidade: string, acao: string): string {
  const info = entidadeConhecida(entidade);
  if (!info) return `${entidade}: ${acao}`;
  if (acao === 'status_alterado') {
    return `Status ${info.genero === 'f' ? 'da' : 'do'} ${info.rotulo.toLowerCase()} alterado`;
  }
  const radical = PARTICIPIOS[acao.slice(0, -1)];
  if (!radical || !/[ao]$/.test(acao)) return `${info.rotulo}: ${acao}`;
  return `${info.rotulo} ${radical}${info.genero === 'f' ? 'a' : 'o'}`;
}

/** Quem fez: o nome; sem nome, o tipo de ator. */
export function rotuloDoAtor(ator: AtorHistoricoDto): string {
  if (ator.nome) return ator.nome;
  if (ator.tipo === 'sistema') return 'Sistema';
  if (ator.tipo === 'robo') return 'Robô';
  return 'Usuário removido';
}

/**
 * Chaves que só dizem a que médico, turno e frente o evento se refere (`auditoria-escala.ts`), por
 * entidade. No turno, `frenteIds` é dado de verdade (as frentes do turno), e os ids de
 * especialidade e modalidade repetem as mesmas frentes sem nome na página; no recorte, os nomes já
 * vêm em `turnos` e `frentes`. O `id` do próprio registro nunca é alteração.
 */
const CONTEXTO_DA_ENTIDADE: Record<string, Set<string>> = {
  alocacao: new Set(['id', 'medicoId', 'turnoId', 'frenteId']),
  ajuste_produtividade: new Set(['id', 'medicoId', 'turnoId', 'frenteId']),
  // O médico já vem no cabeçalho do evento; a alocação repetiria médico, turno e frente.
  ajuste_dia_distribuicao: new Set(['id', 'alocacaoId', 'medicoId', 'turnoId', 'frenteId']),
  ausencia: new Set(['id', 'medicoId', 'turnoIds', 'frenteIds']),
  escopo_escala: new Set(['id', 'turnoIds', 'frenteIds']),
  turno: new Set(['id', 'especialidadeIds', 'modalidadeIds']),
};
const SEM_CONTEXTO = new Set(['id']);

/** Nome de cada id citado nos eventos da página (`PaginaHistoricoDto.nomes`). */
export type NomesHistorico = Record<string, string>;
const SEM_NOME = '—';

/** Marcas que a API grava no lugar de texto sensível (LGPD): só dizem que mudou. */
const MARCAS: Record<string, { rotulo: string; texto: string }> = {
  observacoesAlteradas: { rotulo: 'Observações', texto: 'alteradas' },
  motivoRecusaAlterado: { rotulo: 'Motivo da recusa', texto: 'informado' },
};

const CAMPOS: Record<string, string> = {
  medico: 'Médico',
  turno: 'Turno',
  turnos: 'Turnos',
  frentes: 'Frentes',
  frenteIds: 'Frentes',
  turnoIds: 'Turnos',
  especialidade: 'Especialidade',
  especialidades: 'Especialidades',
  especialidadeId: 'Especialidade',
  modalidade: 'Modalidade',
  modalidades: 'Modalidades',
  modalidadeId: 'Modalidade',
  destinoNome: 'Destino',
  diasSemana: 'Dias',
  semanasDoMes: 'Semanas do mês',
  intervaloDias: 'Repete a cada',
  horario: 'Horário',
  horarioInicio: 'Início',
  horarioFim: 'Fim',
  data: 'Dia',
  dataInicio: 'Data de início',
  dataFim: 'Data de fim',
  status: 'Status',
  produtividade: 'Produtividade',
  prioridades: 'Prioridades',
  prioridadeIds: 'Prioridades',
  subespecialidades: 'Segmentos',
  subespecialidadeIds: 'Segmentos',
  subespecialidadeGeral: 'Segmento geral',
  gratificado: 'Gratificado',
  coberturaDe: 'Cobertura de',
  coberturaDeId: 'Cobertura de',
  alocacaoId: 'Alocação',
  tipo: 'Tipo',
  tipoId: 'Tipo',
  observacoes: 'Observações',
  situacao: 'Situação',
  origem: 'Origem',
  motivoRecusa: 'Motivo da recusa',
  nome: 'Nome',
  descricao: 'Descrição',
  cor: 'Cor',
  ordem: 'Ordem',
  ativo: 'Ativo',
  gravidade: 'Gravidade',
  soGestor: 'Só o gestor lança',
  contaComoFalta: 'Conta como falta',
  prioridadeIdsLiberadas: 'Aceita também',
  /** Eventos de antes de 18/11/2026 (o ajuste valia só para a Lista). */
  listaSegueSla: 'A Lista segue o SLA',
  segueSla: 'Segue o SLA neste dia',
  clienteId: 'Só para o cliente',
  laudosExtra: 'Laudos a mais deste cliente',
};

const VALORES: Record<string, string> = {
  ativo: 'Ativo',
  ferias: 'Férias',
  licenca: 'Licença',
  folga: 'Folga',
  falta_justificada: 'Falta justificada',
  falta_nao_justificada: 'Falta não justificada',
  dispensado: 'Dispensado',
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  gestor: 'Gestor',
  medico: 'Médico (portal)',
  fixo: 'Fixo',
  lista: 'Lista de produção',
  especialidade: 'Especialidade',
  modalidade: 'Modalidade',
};
/** Só nestes campos o valor é um código: um turno chamado "lista" continua "lista". */
const CODIFICADOS = new Set(['status', 'tipo', 'situacao', 'origem']);

const DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

export const VAZIO = '(vazio)';

export type LinhaAlteracao = { rotulo: string; antes: string | null; depois: string | null };

const vazio = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Forma comparável: vazios são iguais e listas comparam como conjunto. */
function comparavel(v: unknown): string {
  if (vazio(v)) return 'null';
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => JSON.stringify(x)).sort());
  return JSON.stringify(v);
}

const ehId = (v: unknown) => typeof v === 'string' && UUID.test(v);
const ehListaDeIds = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(ehId);

/** "campoNovoX" → "Campo novo x". */
function rotuloDoCampo(campo: string) {
  if (CAMPOS[campo]) return CAMPOS[campo];
  const palavras = campo.replace(/([A-Z])/g, ' $1').toLowerCase();
  return palavras.charAt(0).toUpperCase() + palavras.slice(1);
}

function formatarValor(campo: string, v: unknown, nomes: NomesHistorico): string {
  if (vazio(v)) return VAZIO;
  if (ehId(v)) return nomes[v as string] ?? SEM_NOME;
  if (ehListaDeIds(v)) return (v as string[]).map((id) => nomes[id] ?? SEM_NOME).join(', ');
  if (campo === 'diasSemana' && Array.isArray(v)) {
    // Seg→Dom, a ordem das telas da escala.
    return [...v]
      .map(Number)
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      .map((d) => DIA_CURTO[d] ?? String(d))
      .join(', ');
  }
  if (campo === 'semanasDoMes' && Array.isArray(v)) {
    return v.map((n) => (Number(n) === -1 ? 'Última' : `${n}ª`)).join(', ');
  }
  if (campo === 'intervaloDias') return `${v} dias`;
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'string') {
    if (DIA.test(v)) return v.split('-').reverse().join('/');
    if (HORA.test(v)) return v.slice(0, 5);
    if (CODIFICADOS.has(campo)) return VALORES[v] ?? v;
    return v;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Linhas "Campo: antes → depois" de um evento, só com o que mudou. Na criação só há o depois (com
 * os campos preenchidos); na exclusão, só o antes. Ids viram o nome que a página traz em `nomes`
 * ("—" quando não há).
 */
export function alteracoesDoEvento(
  evento: {
    entidade: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  },
  nomes: NomesHistorico = {},
): LinhaAlteracao[] {
  const { antes, depois } = evento;
  const contexto = CONTEXTO_DA_ENTIDADE[evento.entidade] ?? SEM_CONTEXTO;
  const campos = [...new Set([...Object.keys(depois ?? {}), ...Object.keys(antes ?? {})])].filter(
    (c) => !contexto.has(c),
  );
  const linhas: LinhaAlteracao[] = [];

  for (const campo of campos) {
    const de = antes?.[campo];
    const para = depois?.[campo];
    const marca = MARCAS[campo];
    if (marca) {
      if (para === true) linhas.push({ rotulo: marca.rotulo, antes: null, depois: marca.texto });
      continue;
    }
    const rotulo = rotuloDoCampo(campo);

    if (antes && depois) {
      if (comparavel(de) === comparavel(para)) continue;
      linhas.push({
        rotulo,
        antes: formatarValor(campo, de, nomes),
        depois: formatarValor(campo, para, nomes),
      });
      continue;
    }

    const valor = depois ? para : de;
    if (vazio(valor)) continue;
    const texto = formatarValor(campo, valor, nomes);
    linhas.push(
      depois ? { rotulo, antes: null, depois: texto } : { rotulo, antes: texto, depois: null },
    );
  }

  return linhas;
}
