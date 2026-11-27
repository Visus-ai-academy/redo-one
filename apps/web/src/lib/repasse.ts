// Textos e contas da tela do repasse (Financeiro › Repasse).
import type { CompetenciaRepasseDto } from '../gen/types/CompetenciaRepasseDto';
import type { GrupoRepasseDto } from '../gen/types/GrupoRepasseDto';
import type { VersaoRepasseDto } from '../gen/types/VersaoRepasseDto';
import { dataDeBrasilia, horaDeBrasilia } from './datas';
import { numero, plural } from './formato';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** "2026-11" → "Novembro/2026". */
export function nomeCompetencia(competencia: string) {
  const [ano, mes] = competencia.split('-');
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`;
}

export const ROTULO_TIPO_ADICIONAL = {
  avulso: 'Avulso',
  plantao: 'Plantão',
  peer_review: 'Peer Review',
} as const;
export type TipoAdicional = keyof typeof ROTULO_TIPO_ADICIONAL;

/** "TC · NEURO · SC · Rotina": o arranjo do grupo (o que falta vira travessão). */
export function textoDoArranjo(
  g: Pick<GrupoRepasseDto, 'modalidade' | 'especialidade' | 'categoria' | 'prioridade'>,
) {
  return [g.modalidade, g.especialidade, g.categoria, g.prioridade]
    .map((x) => x ?? '—')
    .join(' · ');
}

const ORIGEM: Record<GrupoRepasseDto['origem'], string> = {
  todos: 'Tabela do médico',
  cliente: 'Preço do cliente',
  unidade: 'Preço da unidade',
  tarifa_propria: 'Tarifa própria',
  sem_preco: 'Sem preço',
};

/** De onde veio o preço do grupo; pela categoria alternativa, mostra a troca ("COLUNAS → SC"). */
export function origemDoPreco(g: Pick<GrupoRepasseDto, 'origem' | 'categoria' | 'categoriaPreco'>) {
  if (g.origem !== 'sem_preco' && g.categoriaPreco)
    return `Alternativa: ${g.categoria ?? 'sem categoria'} → ${g.categoriaPreco}`;
  return ORIGEM[g.origem];
}

/**
 * Valor digitado em pt-BR ("1.200,50") em centavos; nulo se não for um valor. Com `negativo`,
 * aceita o sinal de menos (o desconto do avulso).
 */
export function centavosDoTexto(texto: string, { negativo = false } = {}): number | null {
  let t = texto.trim().replace('−', '-');
  const menos = t.startsWith('-');
  if (menos) {
    if (!negativo) return null;
    t = t.slice(1).trim();
  }
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) return null;
  const [inteiros = '0', centavos = ''] = t.replace(/\./g, '').split(',');
  const valor = Number(inteiros) * 100 + Number(centavos.padEnd(2, '0'));
  return menos ? -valor : valor;
}

/** Centavos como o campo do formulário mostra: "1.234,56". */
export function textoDeCentavos(centavos: number) {
  return numero(centavos / 100, 2);
}

type Situacao = Pick<
  CompetenciaRepasseDto,
  'status' | 'fechadaEm' | 'fechadaPor' | 'recalculoPendente'
>;

/** A linha abaixo do título: quem fechou, a versão vista (e o motivo do recálculo) ou a prévia. */
export function textoDaSituacao(c: Situacao, versao: VersaoRepasseDto | null) {
  const partes: string[] = [];
  if (c.status === 'fechada')
    partes.push(
      `Fechada${c.fechadaEm ? ` em ${dataDeBrasilia(c.fechadaEm)}` : ''}${c.fechadaPor ? ` por ${c.fechadaPor}` : ''}.`,
    );
  if (c.recalculoPendente) {
    const r = c.recalculoPendente;
    partes.push(
      `Recálculo pedido${r.solicitadoPor ? ` por ${r.solicitadoPor}` : ''} em ${dataDeBrasilia(r.solicitadoEm)}, em andamento.`,
    );
  } else if (!versao) {
    partes.push('O repasse desta competência ainda não foi gerado.');
  } else if (versao.recalculo) {
    const r = versao.recalculo;
    partes.push(
      `Versão ${versao.numero} recalculada em ${dataDeBrasilia(versao.geradoEm)}${r.solicitadoPor ? ` por ${r.solicitadoPor}` : ''}: “${r.motivo}”.`,
    );
  } else if (c.status === 'aberta') {
    partes.push(
      `Prévia gerada em ${dataDeBrasilia(versao.geradoEm)} às ${horaDeBrasilia(versao.geradoEm)}; refeita a cada importação e a cada mudança.`,
    );
  } else {
    partes.push(`Versão ${versao.numero} gerada em ${dataDeBrasilia(versao.geradoEm)}.`);
  }
  return partes.join(' ');
}

/** A faixa dos sem preço: na aberta, eles travam o fechamento; na fechada, só se informa. */
export function textoSemPreco(
  t: { gruposSemPreco: number; laudosSemPreco: number },
  status: 'aberta' | 'fechada',
) {
  const arranjos = plural(t.gruposSemPreco, {
    um: 'arranjo sem preço',
    varios: 'arranjos sem preço',
  });
  const laudos = plural(t.laudosSemPreco, {
    um: 'laudo pago a zero',
    varios: 'laudos pagos a zero',
  });
  return `${arranjos} (${laudos}) ${status === 'aberta' ? (t.gruposSemPreco === 1 ? 'trava' : 'travam') + ' o fechamento' : 'nesta versão'}.`;
}
