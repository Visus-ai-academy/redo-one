import type { ConfiguracaoTipificacaoDto } from '../../gen/types/ConfiguracaoTipificacaoDto';
import type { LinhaTipificacaoDto } from '../../gen/types/LinhaTipificacaoDto';
import type { OpcaoBusca } from '../busca/BuscaSelecao';

/** Linha como o formulário edita: médicos com o nome (pílulas) e uma chave estável para a lista. */
export type LinhaForm = Omit<LinhaTipificacaoDto, 'medicos'> & {
  chave: string;
  medicos: OpcaoBusca[];
};

export type ConfiguracaoForm = {
  /** Vazio = herda do principal (unidade) ou fica na padrão. */
  regraId: string;
  subregraDemaisId: string;
  linhas: LinhaForm[];
};

export const ROTULO_TIPO: Record<LinhaTipificacaoDto['tipo'], string> = {
  modalidade: 'Modalidade',
  especialidade: 'Especialidade',
  prioridade: 'Prioridade',
};

export const ROTULO_MODO: Record<LinhaTipificacaoDto['modoMedico'], string> = {
  todos: 'Qualquer médico',
  apenas: 'Apenas estes médicos',
  exceto: 'Exceto estes médicos',
};

type Nomes = {
  valores: ReadonlyMap<string, string>;
  subregras: ReadonlyMap<string, string>;
  equipes: ReadonlyMap<string, string>;
};

/** Até 3 nomes; depois, "e mais N" (a lista inteira está no formulário da linha). */
const MAXIMO_NA_FRASE = 3;

const ou = (lista: string[]) => {
  if (lista.length > MAXIMO_NA_FRASE)
    return `${lista.slice(0, MAXIMO_NA_FRASE).join(', ')} ou mais ${lista.length - MAXIMO_NA_FRASE}`;
  return lista.length <= 1
    ? (lista[0] ?? '')
    : `${lista.slice(0, -1).join(', ')} ou ${lista.at(-1)}`;
};

/** "Se especialidade for MEDICINA INTERNA e o médico for apenas Rodrigo Vaz de Lima → NC-NF". */
export function fraseDaLinha(l: LinhaForm, nomes: Nomes): string {
  const valores = l.valores.map((v) => nomes.valores.get(v) ?? '?');
  const criterio = `Se ${ROTULO_TIPO[l.tipo].toLowerCase()} for ${valores.length ? ou(valores) : '(escolha)'}`;
  const quem = [
    ...l.medicos.map((m) => m.rotulo),
    ...l.equipes.map((e) => `de ${nomes.equipes.get(e) ?? '?'}`),
  ];
  const medico =
    l.modoMedico === 'todos'
      ? ''
      : ` e o médico ${l.modoMedico === 'apenas' ? 'for apenas' : 'não for'} ${quem.length ? ou(quem) : '(escolha)'}`;
  return `${criterio}${medico} → ${nomes.subregras.get(l.subregraId) ?? '(escolha a sub-regra)'}`;
}

/** A lista com o item de `de` levado para `para` (fora dos limites, fica igual). */
export function mover<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return [...lista];
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item as T);
  return nova;
}

/** Da API para o formulário (sem configuração = tudo vazio). */
export function valoresDaConfiguracao(
  c: ConfiguracaoTipificacaoDto | null,
  nomesMedicos: ReadonlyMap<string, string>,
  novaChave: () => string = () => crypto.randomUUID(),
): ConfiguracaoForm {
  return {
    regraId: c?.regraId ?? '',
    subregraDemaisId: c?.subregraDemaisId ?? '',
    linhas: (c?.linhas ?? []).map((l) => ({
      chave: novaChave(),
      tipo: l.tipo,
      valores: l.valores,
      modoMedico: l.modoMedico,
      medicos: l.medicos.map((id) => ({ valor: id, rotulo: nomesMedicos.get(id) ?? 'Médico' })),
      equipes: l.equipes,
      subregraId: l.subregraId,
    })),
  };
}

/** Do formulário para a API; com "qualquer médico", médicos e equipes não vão. */
export function corpoDaConfiguracao(f: ConfiguracaoForm): ConfiguracaoTipificacaoDto {
  return {
    regraId: f.regraId || null,
    subregraDemaisId: f.subregraDemaisId || null,
    linhas: f.linhas.map((l) => {
      const todos = l.modoMedico === 'todos';
      return {
        tipo: l.tipo,
        valores: l.valores,
        modoMedico: l.modoMedico,
        medicos: todos ? [] : l.medicos.map((m) => m.valor),
        equipes: todos ? [] : l.equipes,
        subregraId: l.subregraId,
      };
    }),
  };
}

/**
 * O que salvar no painel da regra ou da sub-regra: o que não muda o cálculo (nome, descrição, cor,
 * situação) vai como alteração; o "fatura" mudado vai como versão nova, a partir da competência.
 */
export function pedidosDoPainel<T extends { fatura: boolean; aPartirDe: string }>(
  antes: T,
  depois: T,
): { dados: boolean; fatura: { fatura: boolean; aPartirDe: string } | null } {
  const { fatura: _fa, aPartirDe: _aa, ...dadosAntes } = antes;
  const { fatura: _fd, aPartirDe: _ad, ...dadosDepois } = depois;
  return {
    dados: JSON.stringify(dadosAntes) !== JSON.stringify(dadosDepois),
    fatura:
      antes.fatura === depois.fatura
        ? null
        : { fatura: depois.fatura, aPartirDe: depois.aPartirDe },
  };
}
