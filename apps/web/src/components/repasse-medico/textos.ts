import type { ModoContagemRepasseKey } from '../../gen/types/ModoContagemRepasse';
import type { RegraApuracaoDto } from '../../gen/types/RegraApuracaoDto';
import type { TipoRegraApuracaoKey } from '../../gen/types/TipoRegraApuracao';
import type { VersaoContagemDto } from '../../gen/types/VersaoContagemDto';
import { moeda } from '../../lib/formato';

export const ROTULO_MODO: Record<ModoContagemRepasseKey, string> = {
  todos_os_laudos: 'Todos os laudos',
  recortes: 'Só os recortes cliente × especialidade',
  somente_adicionais: 'Somente adicionais',
};

export const AJUDA_MODO: Record<ModoContagemRepasseKey, string> = {
  todos_os_laudos: 'Todo laudo do médico entra no repasse, pelo preço dele.',
  recortes: 'Só os laudos dos clientes e especialidades escolhidos entram; os outros não contam.',
  somente_adicionais:
    'Nenhum laudo entra: o médico recebe só os adicionais e as regras de apuração.',
};

export const ROTULO_TIPO_REGRA: Record<TipoRegraApuracaoKey, string> = {
  fixo: 'Fixo',
  por_laudo: 'Por laudo',
  percentual_repasse: 'Percentual do repasse',
  tarifa_laudo: 'Tarifa própria',
};

export const AJUDA_TIPO_REGRA: Record<TipoRegraApuracaoKey, string> = {
  fixo: 'Um valor por competência.',
  por_laudo: 'Um valor por laudo da operação inteira que casa os recortes (ex.: coordenação).',
  percentual_repasse:
    'Um percentual do valor de exames dos médicos que laudam as especialidades do recorte.',
  tarifa_laudo: 'Um valor por laudo do próprio médico, no lugar dos preços dele.',
};

/** Partes por milhão → texto em %, com até 4 casas ("6%", "2,5%"). */
export function percentualDePpm(ppm: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(ppm / 10_000)}%`;
}

/** Partes por milhão no valor do campo de percentual (`NumberField`, ponto decimal): 25000 → "2.5". */
export function campoDoPpm(ppm: number | null | undefined): string {
  return ppm == null ? '' : String(ppm / 10_000);
}

/** O valor do campo de percentual ("2.5") em partes por milhão; vazio ou inválido, nulo. */
export function ppmDoCampo(texto: string): number | null {
  if (texto.trim() === '') return null;
  const n = Number(texto);
  return Number.isFinite(n) ? Math.round(n * 10_000) : null;
}

const lista = (nomes: string[] | null, todas: string) =>
  nomes === null ? todas : nomes.join(', ');

/** O que a versão de contagem diz, numa linha. */
export function descreverContagem(v: Pick<VersaoContagemDto, 'modo' | 'recortes'>): string {
  if (v.modo !== 'recortes') return ROTULO_MODO[v.modo];
  return `Só ${v.recortes
    .map(
      (r) =>
        `${r.cliente ?? 'todos os clientes'} × ${r.especialidade ?? 'todas as especialidades'}`,
    )
    .join('; ')}`;
}

/** Valor (ou %) e "dividir por" da regra. */
export function valorDaRegra(
  r: Pick<RegraApuracaoDto, 'tipo' | 'valorCentavos' | 'percentualPpm' | 'divisor'>,
) {
  const base =
    r.tipo === 'percentual_repasse'
      ? percentualDePpm(r.percentualPpm ?? 0)
      : `${moeda((r.valorCentavos ?? 0) / 100)}${r.tipo === 'fixo' ? ' por competência' : ' por laudo'}`;
  return r.divisor > 1 ? `${base}, dividido por ${r.divisor}` : base;
}

/** Os recortes da regra: "Todas" explícito quando vale para todas. */
export function recortesDaRegra(
  r: Pick<RegraApuracaoDto, 'modalidadeIds' | 'especialidadeIds' | 'prioridadeIds' | 'nomes'>,
) {
  return [
    `Modalidades: ${lista(r.modalidadeIds === null ? null : r.nomes.modalidades, 'todas')}`,
    `especialidades: ${lista(r.especialidadeIds === null ? null : r.nomes.especialidades, 'todas')}`,
    `prioridades: ${lista(r.prioridadeIds === null ? null : r.nomes.prioridades, 'todas')}`,
  ].join('; ');
}
