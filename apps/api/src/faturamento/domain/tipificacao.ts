/**
 * Tipificação do laudo (CO/NC/NC1 + sub-regra): decide se ele fatura. Função pura sobre a
 * configuração gravada; nada de regra no código, só o mecanismo:
 *
 * - a configuração é do cliente ou da unidade: a unidade usa a dela; sem configuração própria,
 *   a do principal; sem nenhuma, a regra padrão;
 * - vale a primeira linha que casar (critério + filtro de médico); senão "todos os demais"; senão
 *   a regra principal sem sub-regra (na unidade sem regra, a do principal; senão a padrão);
 * - com sub-regra, a regra é a dela e fatura pelo `fatura` dela; sem, pelo `fatura_sem_subregra`
 *   da regra;
 * - filtro de médico: `apenas` nunca casa com laudo sem médico, `exceto` sempre casa; a equipe
 *   vale pelos membros.
 */

export type TipoLinha = 'modalidade' | 'especialidade' | 'prioridade';
export type ModoMedico = 'todos' | 'apenas' | 'exceto';

export interface LinhaTipificacao {
  tipo: TipoLinha;
  /** Ids de modalidade, especialidade ou prioridade (do catálogo), conforme o tipo. */
  valores: string[];
  modoMedico: ModoMedico;
  medicos: string[];
  equipes: string[];
  subregraId: string;
}

export interface ConfiguracaoCliente {
  clienteId: string;
  regraId: string | null;
  subregraDemaisId: string | null;
  /** Na ordem em que são avaliadas. */
  linhas: LinhaTipificacao[];
}

export interface ConfiguracaoTipificacao {
  regras: { id: string; faturaSemSubregra: boolean; padrao: boolean }[];
  subregras: { id: string; regraId: string; fatura: boolean }[];
  equipes: { id: string; medicos: string[] }[];
  clientes: ConfiguracaoCliente[];
}

/** O que a tipificação lê do laudo: tudo já resolvido pela importação. */
export interface LaudoParaTipificar {
  /** O principal. */
  clienteId: string | null;
  /** A unidade de origem, quando a empresa casou com uma. */
  unidadeId: string | null;
  modalidadeId: string | null;
  especialidadeId: string | null;
  prioridadeId: string | null;
  medicoId: string | null;
}

export interface Tipificacao {
  regraId: string;
  subregraId: string | null;
  fatura: boolean;
}

export type Tipificador = (laudo: LaudoParaTipificar) => Tipificacao;

interface LinhaPronta {
  tipo: TipoLinha;
  valores: Set<string>;
  modoMedico: ModoMedico;
  medicos: Set<string>;
  subregraId: string;
}

const CAMPO: Record<TipoLinha, keyof LaudoParaTipificar> = {
  modalidade: 'modalidadeId',
  especialidade: 'especialidadeId',
  prioridade: 'prioridadeId',
};

export function montarTipificador(config: ConfiguracaoTipificacao): Tipificador {
  const padrao = config.regras.find((r) => r.padrao);
  if (!padrao) throw new Error('Nenhuma regra de tipificação marcada como padrão.');
  const faturaSemSub = new Map(config.regras.map((r) => [r.id, r.faturaSemSubregra]));
  const subregras = new Map(config.subregras.map((s) => [s.id, s]));
  const membros = new Map(config.equipes.map((e) => [e.id, e.medicos]));
  const clientes = new Map(
    config.clientes.map((c) => [
      c.clienteId,
      {
        regraId: c.regraId,
        subregraDemaisId: c.subregraDemaisId,
        linhas: c.linhas.map(
          (l): LinhaPronta => ({
            tipo: l.tipo,
            valores: new Set(l.valores),
            modoMedico: l.modoMedico,
            medicos: new Set([...l.medicos, ...l.equipes.flatMap((e) => membros.get(e) ?? [])]),
            subregraId: l.subregraId,
          }),
        ),
      },
    ]),
  );

  const daSubregra = (id: string): Tipificacao | null => {
    const s = subregras.get(id);
    return s ? { regraId: s.regraId, subregraId: s.id, fatura: s.fatura } : null;
  };
  const casaMedico = (l: LinhaPronta, medicoId: string | null) => {
    if (l.modoMedico === 'todos') return true;
    const listado = medicoId !== null && l.medicos.has(medicoId);
    return l.modoMedico === 'apenas' ? listado : !listado;
  };

  return (laudo) => {
    const principal = laudo.clienteId ? clientes.get(laudo.clienteId) : undefined;
    const daUnidade = laudo.unidadeId ? clientes.get(laudo.unidadeId) : undefined;
    const cfg = daUnidade ?? principal;
    if (cfg) {
      for (const l of cfg.linhas) {
        const valor = laudo[CAMPO[l.tipo]];
        if (valor && l.valores.has(valor) && casaMedico(l, laudo.medicoId)) {
          const t = daSubregra(l.subregraId);
          if (t) return t;
        }
      }
      if (cfg.subregraDemaisId) {
        const t = daSubregra(cfg.subregraDemaisId);
        if (t) return t;
      }
    }
    const regraId = cfg?.regraId ?? (daUnidade ? principal?.regraId : null) ?? padrao.id;
    return { regraId, subregraId: null, fatura: faturaSemSub.get(regraId) ?? true };
  };
}
