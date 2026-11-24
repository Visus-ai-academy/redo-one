// Apresentação dos eventos do Histórico dos cadastros (médico, cliente, exame): o que aconteceu e
// o que mudou, em português. Os ids viram o nome que a página da API traz em `nomes`.

import { type LinhaAlteracao, VAZIO } from '../escala-historico/historico';

export type { LinhaAlteracao };
export type NomesHistorico = Record<string, string>;

type Evento = {
  entidade: string;
  entidadeId: string;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
};

/** Entidade → ação → frase. */
const FRASES: Record<string, Record<string, string>> = {
  medico: {
    criado: 'Médico criado',
    alterado: 'Cadastro alterado',
    excluido: 'Médico excluído',
    alias_criado: 'Apelido adicionado',
    alias_excluido: 'Apelido removido',
    conta_mobilemed_adicionada: 'Outra conta na MobileMed adicionada',
    conta_mobilemed_removida: 'Outra conta na MobileMed removida',
    pagamento_lido: 'Dados de pagamento consultados',
    pagamento_alterado: 'Dados de pagamento alterados',
  },
  medico_distribuicao: { alterado: 'Robô de distribuição alterado' },
  arranjos_medico: { alterado: 'Arranjos alterados' },
  usuario: {
    convidado: 'Convite para o portal enviado',
    medico_vinculado: 'Conta do portal ligada',
    medico_desvinculado: 'Conta do portal desligada',
  },
  cliente: {
    criado: 'Cliente criado',
    alterado: 'Cadastro alterado',
    excluido: 'Cliente excluído',
    alias_criado: 'Apelido adicionado',
    alias_excluido: 'Apelido removido',
    unidade_adicionada: 'Unidade adicionada',
    unidade_removida: 'Unidade removida',
    unificado_em: 'Virou unidade de outro cliente',
    unificacao_desfeita: 'Deixou de ser unidade',
  },
  exame: { criado: 'Exame criado', alterado: 'Cadastro alterado', excluido: 'Exame excluído' },
  de_para_valor_exame: {
    criado: 'Valor fora do padrão criado',
    alterado: 'Valor fora do padrão alterado',
    excluido: 'Valor fora do padrão excluído',
  },
};

const NOME_DA_ENTIDADE: Record<string, string> = {
  medico: 'Médico',
  medico_distribuicao: 'Distribuição',
  arranjos_medico: 'Arranjos',
  usuario: 'Conta do portal',
  equipe: 'Equipe',
  cliente: 'Cliente',
  exame: 'Exame',
  de_para_valor_exame: 'Valor fora do padrão',
};

/** No médico, o evento da equipe diz o que mudou para ele; `nome` é o da equipe. */
function fraseDaEquipe(acao: string, nome: string | undefined): string | undefined {
  if (acao === 'membro_entrou') return nome ? `Entrou na ${nome}` : 'Entrou numa equipe';
  if (acao === 'membro_saiu') return nome ? `Saiu da ${nome}` : 'Saiu de uma equipe';
  if (acao === 'equipe_excluida') {
    return `${nome ? `Saiu da ${nome}` : 'Saiu de uma equipe'} (equipe excluída)`;
  }
  return undefined;
}

/**
 * "Médico criado", "Apelido adicionado", "Arranjos alterados". `nomeDoAlvo` é o nome do id do
 * evento, usado quando a frase o cita ("Entrou na Equipe 2").
 */
export function descreverEventoCadastro(
  entidade: string,
  acao: string,
  nomeDoAlvo?: string,
): string {
  if (entidade === 'equipe') {
    const frase = fraseDaEquipe(acao, nomeDoAlvo);
    if (frase) return frase;
  }
  return (
    FRASES[entidade]?.[acao] ??
    `${NOME_DA_ENTIDADE[entidade] ?? entidade}: ${acao.replace(/_/g, ' ')}`
  );
}

const CAMPOS: Record<string, string> = {
  nome: 'Nome',
  crm: 'CRM',
  idMobilemed: 'ID na MobileMed',
  email: 'E-mail',
  telefone: 'Telefone',
  ativo: 'Ativo',
  ocultoDashboards: 'Oculto nos painéis',
  senior: 'Sênior',
  fellowship: 'Fez fellowship',
  funcao: 'Função',
  nivelId: 'Nível',
  dataInicioVinculo: 'Início do vínculo',
  observacoes: 'Observações',
  observacao: 'Observação',
  motivo: 'Motivo',
  nomeOrigem: 'Apelido',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  razaoSocial: 'Razão social',
  tipoChavePix: 'Tipo da chave Pix',
  chavePix: 'Chave Pix',
  socio: 'Sócio',
  optanteSimples: 'Optante do Simples',
  omieCodigoFornecedor: 'Fornecedor no Omie',
  habilitadoRobo: 'Habilitado no robô',
  unidadeTeto: 'Conta o teto por',
  nomeFantasia: 'Nome fantasia',
  tipoPessoa: 'Tipo de pessoa',
  contratadoId: 'Empresa que fatura',
  tipo: 'Tipo',
  padrao: 'Apelido',
  unidade: 'Unidade',
  principal: 'Cliente principal',
  codigo: 'Código',
  descricao: 'Descrição',
  modalidadeId: 'Modalidade',
  especialidadeId: 'Especialidade',
  subespecialidadeId: 'Subespecialidade',
  categoriaId: 'Categoria',
  prioridadeId: 'Prioridade',
  permiteQuebra: 'Permite quebra',
  exigeRevisaoManual: 'Exige revisão manual',
  estudoDescricao: 'Estudo',
  valores: 'Valores',
  exameId: 'Exame',
  papelId: 'Papel',
  papelIds: 'Papéis',
};

/** Só nestes campos o valor é um código. */
const VALORES: Record<string, Record<string, string>> = {
  funcao: { STAFF: 'Staff', FELLOW: 'Fellow (em formação)' },
  tipoPessoa: { PJ: 'Pessoa jurídica', PF: 'Pessoa física' },
  unidadeTeto: { exames: 'Exames', laudos: 'Laudos' },
  tipo: { exato: 'Igual a', prefixo: 'Começa com', normalizado: 'Igual sem acento e pontuação' },
  tipoChavePix: {
    CPF: 'CPF',
    CNPJ: 'CNPJ',
    EMAIL: 'E-mail',
    TELEFONE: 'Telefone',
    ALEATORIA: 'Chave aleatória',
  },
};

/** Números que são identificadores: sem separador de milhar. */
const IDS = new Set(['idMobilemed']);

/** Campos que só dizem a quem o evento se refere, por entidade. */
const CONTEXTO: Record<string, Set<string>> = {
  // A conta aparece pelo id do evento; nome, e-mail e CPF dela são da tela Usuários.
  usuario: new Set(['medicoId', 'nome', 'email', 'cpf']),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const SEM_NOME = '—';

const vazio = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const ehId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const nomeDe = (id: string, nomes: NomesHistorico) => nomes[id.toLowerCase()] ?? SEM_NOME;

function rotuloDoCampo(campo: string) {
  if (CAMPOS[campo]) return CAMPOS[campo];
  const palavras = campo.replace(/([A-Z])/g, ' $1').toLowerCase();
  return palavras.charAt(0).toUpperCase() + palavras.slice(1);
}

function formatarValor(campo: string, v: unknown, nomes: NomesHistorico): string {
  if (vazio(v)) return VAZIO;
  if (ehId(v)) return nomeDe(v, nomes);
  if (Array.isArray(v)) return v.map((x) => (ehId(x) ? nomeDe(x, nomes) : String(x))).join(', ');
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'string') {
    if (DIA.test(v)) return v.split('-').reverse().join('/');
    return VALORES[campo]?.[v] ?? v;
  }
  if (typeof v === 'number') return IDS.has(campo) ? String(v) : v.toLocaleString('pt-BR');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

type Arranjo = {
  especialidadeId?: string | null;
  modalidadeIds?: string[];
  subespecialidadeIds?: string[];
  subespecialidadeGeral?: boolean;
  prioridadeIds?: string[];
  modoClientes?: string;
  clienteIds?: string[];
  modoExames?: string;
  exameIds?: string[];
  clientesExclusivosIds?: string[];
};

/** Forma comparável: chaves em ordem e listas como conjunto. */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return JSON.stringify(valor.map(canonico).sort());
  if (valor && typeof valor === 'object') {
    return JSON.stringify(
      Object.keys(valor)
        .sort()
        .map((k) => [k, canonico((valor as Record<string, unknown>)[k])]),
    );
  }
  return JSON.stringify(valor ?? null);
}

/** "NEURO; modalidades: CT, MR; clientes: só CLINICA SOL". */
export function descreverArranjo(a: Arranjo, nomes: NomesHistorico): string {
  const lista = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => nomeDe(id, nomes)).join(', ');
  const partes = [a.especialidadeId ? nomeDe(a.especialidadeId, nomes) : 'Todas as especialidades'];
  if (a.modalidadeIds?.length) partes.push(`modalidades: ${lista(a.modalidadeIds)}`);
  if (a.subespecialidadeIds?.length || a.subespecialidadeGeral) {
    const segmentos = [lista(a.subespecialidadeIds), a.subespecialidadeGeral ? 'geral' : '']
      .filter(Boolean)
      .join(', ');
    partes.push(
      a.subespecialidadeIds?.length ? `segmentos: ${segmentos}` : 'segmentos: só o geral',
    );
  }
  if (a.prioridadeIds?.length) partes.push(`prioridades: ${lista(a.prioridadeIds)}`);
  const modo = (rotulo: string, m: string | undefined, ids: string[] | undefined) => {
    if (m === 'apenas') partes.push(`${rotulo}: só ${lista(ids)}`);
    if (m === 'exceto') partes.push(`${rotulo}: exceto ${lista(ids)}`);
  };
  modo('clientes', a.modoClientes, a.clienteIds);
  modo('exames', a.modoExames, a.exameIds);
  if (a.clientesExclusivosIds?.length) {
    partes.push(`exclusivo em: ${lista(a.clientesExclusivosIds)}`);
  }
  return partes.join('; ');
}

function alteracoesDosArranjos(evento: Evento, nomes: NomesHistorico): LinhaAlteracao[] {
  const antes = (evento.antes?.arranjos ?? []) as Arranjo[];
  const depois = (evento.depois?.arranjos ?? []) as Arranjo[];
  const chavesAntes = new Set(antes.map(canonico));
  const chavesDepois = new Set(depois.map(canonico));
  return [
    ...antes
      .filter((a) => !chavesDepois.has(canonico(a)))
      .map((a) => ({
        rotulo: 'Arranjo removido',
        antes: descreverArranjo(a, nomes),
        depois: null,
      })),
    ...depois
      .filter((a) => !chavesAntes.has(canonico(a)))
      .map((a) => ({
        rotulo: 'Arranjo incluído',
        antes: null,
        depois: descreverArranjo(a, nomes),
      })),
  ];
}

/**
 * Linhas "Campo: antes → depois" de um evento, só com o que mudou. Na criação só há o depois (com
 * os campos preenchidos); na exclusão, só o antes. Valores que a API gravou mascarados (CPF,
 * chave Pix) aparecem como vieram.
 */
export function alteracoesDoCadastro(evento: Evento, nomes: NomesHistorico = {}): LinhaAlteracao[] {
  if (evento.entidade === 'arranjos_medico') return alteracoesDosArranjos(evento, nomes);

  const linhas: LinhaAlteracao[] = [];
  if (evento.entidade === 'usuario') {
    const conta = nomeDe(evento.entidadeId, nomes);
    linhas.push(
      evento.acao === 'medico_desvinculado'
        ? { rotulo: 'Conta', antes: conta, depois: null }
        : { rotulo: 'Conta', antes: null, depois: conta },
    );
  }

  const { antes, depois } = evento;
  const contexto = CONTEXTO[evento.entidade] ?? new Set<string>();
  const campos = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])].filter(
    (c) => !contexto.has(c),
  );
  for (const campo of campos) {
    const de = antes?.[campo];
    const para = depois?.[campo];
    const rotulo = rotuloDoCampo(campo);
    if (antes && depois) {
      if (canonico(vazio(de) ? null : de) === canonico(vazio(para) ? null : para)) continue;
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
