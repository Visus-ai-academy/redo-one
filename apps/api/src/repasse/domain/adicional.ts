import { ErroDeDominio } from '../../comum/erro-de-dominio';
import { COMPETENCIA_RE } from './vigencia';

export type TipoAdicional = 'avulso' | 'peer_review' | 'plantao';

/** O que a pessoa informa ao lançar um adicional. */
export interface PedidoAdicional {
  tipo: TipoAdicional;
  competencia: string;
  /** "AAAA-MM-DD". */
  data: string;
  /** Avulso: obrigatório (≠ 0; negativo = desconto). */
  valorCentavos?: number;
  descricao?: string;
  /** Peer Review e Plantão. */
  quantidade?: number;
  /** Sem ela, vale a tarifa padrão dos parâmetros. */
  valorUnitarioCentavos?: number;
  referenciaDesde?: string;
  referenciaAte?: string;
}

export interface AdicionalMontado {
  tipo: TipoAdicional;
  competencia: string;
  data: string;
  valorCentavos: number;
  descricao: string;
  quantidade: number | null;
  valorUnitarioCentavos: number | null;
  referenciaDesde: string | null;
  referenciaAte: string | null;
}

export class AdicionalInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class PeerReviewJaPagoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor(lancado: { competencia: string; referenciaDesde: string; referenciaAte: string }) {
    super(
      `Período já pago: Peer Review de ${lancado.referenciaDesde} a ${lancado.referenciaAte}, lançado em ${lancado.competencia}.`,
    );
  }
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const reais = (c: number) => moeda.format(c / 100).replace(/ /g, ' ');
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ROTULO: Record<Exclude<TipoAdicional, 'avulso'>, [string, string, string]> = {
  peer_review: ['Peer Review', 'avaliação', 'avaliações'],
  plantao: ['Plantão', 'plantão', 'plantões'],
};

/** Valida o pedido e monta o lançamento: por quantidade, valor = quantidade × tarifa. */
export function montarAdicional(
  p: PedidoAdicional,
  tarifas: { peerReviewCentavos: number; plantaoCentavos: number },
): AdicionalMontado {
  if (!COMPETENCIA_RE.test(p.competencia))
    throw new AdicionalInvalidoError('Informe a competência no formato AAAA-MM.');
  if (!DATA.test(p.data) || Number.isNaN(Date.parse(p.data)))
    throw new AdicionalInvalidoError('Informe a data do lançamento.');
  const informada = (p.descricao ?? '').trim();

  if (p.tipo === 'avulso') {
    const v = p.valorCentavos;
    if (v === undefined || !Number.isInteger(v) || v === 0)
      throw new AdicionalInvalidoError('Informe um valor diferente de zero (negativo = desconto).');
    if (informada.length < 3)
      throw new AdicionalInvalidoError(
        'Descreva o lançamento: é o que explica o valor no demonstrativo do médico.',
      );
    return {
      tipo: 'avulso',
      competencia: p.competencia,
      data: p.data,
      valorCentavos: v,
      descricao: informada,
      quantidade: null,
      valorUnitarioCentavos: null,
      referenciaDesde: null,
      referenciaAte: null,
    };
  }

  const q = p.quantidade;
  if (q === undefined || !Number.isInteger(q) || q < 1)
    throw new AdicionalInvalidoError('Informe a quantidade (inteiro, 1 ou mais).');
  const unitario =
    p.valorUnitarioCentavos ??
    (p.tipo === 'peer_review' ? tarifas.peerReviewCentavos : tarifas.plantaoCentavos);
  if (!Number.isInteger(unitario) || unitario <= 0)
    throw new AdicionalInvalidoError('A tarifa tem de ser maior que zero.');
  let referenciaDesde: string | null = null;
  let referenciaAte: string | null = null;
  let periodo = '';
  if (p.tipo === 'peer_review') {
    referenciaDesde = p.referenciaDesde ?? '';
    referenciaAte = p.referenciaAte || referenciaDesde;
    if (
      !COMPETENCIA_RE.test(referenciaDesde) ||
      !COMPETENCIA_RE.test(referenciaAte) ||
      referenciaAte < referenciaDesde
    )
      throw new AdicionalInvalidoError('Informe os meses avaliados (de e até, AAAA-MM).');
    periodo =
      referenciaDesde === referenciaAte
        ? ` (ref. ${referenciaDesde})`
        : ` (ref. ${referenciaDesde} a ${referenciaAte})`;
  }
  const [nome, um, varios] = ROTULO[p.tipo];
  return {
    tipo: p.tipo,
    competencia: p.competencia,
    data: p.data,
    valorCentavos: q * unitario,
    descricao: `${informada || nome}: ${q} ${q === 1 ? um : varios} × ${reais(unitario)}${periodo}`,
    quantidade: q,
    valorUnitarioCentavos: unitario,
    referenciaDesde,
    referenciaAte,
  };
}
