import { aparar, exigirSemErros } from './erros';

export const TIPOS_CATEGORIA = ['receita', 'despesa'] as const;
export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number];

/** O que a tela manda para criar ou editar uma categoria. */
export interface DadosCategoria {
  tipo: TipoCategoria;
  nome: string;
  /** Grupo (categoria do nível de cima); `null` = a própria categoria é do nível de cima. */
  paiId: string | null;
  codigoContabil: string | null;
  ativa: boolean;
}

/** O que a regra precisa saber do banco para validar. */
export interface ContextoCategoria {
  /** A categoria sendo editada; ausente ao criar. */
  id?: string;
  /** O grupo escolhido, se existir. */
  pai: { id: string; tipo: TipoCategoria; paiId: string | null } | null;
  /** A categoria editada já tem categorias dentro dela (é um grupo). */
  temFilhas: boolean;
  /** Tipo gravado hoje, ao editar. */
  tipoAtual?: TipoCategoria;
}

const PLURAL: Record<TipoCategoria, string> = { receita: 'receitas', despesa: 'despesas' };

/**
 * Valida e normaliza a categoria. Dois níveis só: o grupo é do mesmo tipo e do nível de cima, e um
 * grupo (categoria com filhas) não entra em outro nem muda de tipo, para as filhas não ficarem
 * num grupo do tipo errado.
 */
export function prepararCategoria(
  entrada: DadosCategoria,
  contexto: ContextoCategoria,
): DadosCategoria {
  const erros: Record<string, string> = {};
  const nome = aparar(entrada.nome);
  if (!nome) erros.nome = 'Informe o nome da categoria.';
  else if (nome.length > 120) erros.nome = 'Use até 120 caracteres no nome.';

  const paiId = entrada.paiId || null;
  if (paiId) {
    const { pai } = contexto;
    if (contexto.id && paiId === contexto.id) {
      erros.paiId = 'A categoria não pode ser o grupo dela mesma.';
    } else if (!pai) {
      erros.paiId = 'O grupo escolhido não existe mais. Escolha outro.';
    } else if (contexto.temFilhas) {
      erros.paiId = 'A categoria tem categorias dentro dela: tire-as antes de pô-la num grupo.';
    } else if (pai.tipo !== entrada.tipo) {
      erros.paiId = `O grupo é de ${PLURAL[pai.tipo]}: escolha um grupo de ${PLURAL[entrada.tipo]}.`;
    } else if (pai.paiId) {
      erros.paiId = 'O grupo escolhido já está dentro de outro: escolha um grupo do nível de cima.';
    }
  }
  if (contexto.temFilhas && contexto.tipoAtual && contexto.tipoAtual !== entrada.tipo) {
    erros.tipo = 'A categoria tem categorias dentro dela: o tipo não muda.';
  }
  exigirSemErros(erros);

  return {
    tipo: entrada.tipo,
    nome: nome as string,
    paiId,
    codigoContabil: aparar(entrada.codigoContabil),
    ativa: entrada.ativa,
  };
}
