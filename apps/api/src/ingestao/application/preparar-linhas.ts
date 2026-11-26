import { normalizarNome } from '../../catalogo/comum/nomes';
import type { TipificadorPorCompetencia } from '../../faturamento/domain/tipificacao';
import { type Celula, texto } from '../domain/celulas';
import type { TabelaCortes } from '../domain/competencia';
import { converterLinha } from '../domain/linha-planilha';
import {
  type CadastrosIngestao,
  type LaudoPreparado,
  type OrigemLaudo,
  prepararLaudo,
  type TipoAviso,
} from '../domain/preparar-laudo';
import type { PendenciaRegistrada } from './ports/avisos-cadastro.repository';
import type { AlteracoesLaudos } from './ports/laudos.repository';
import type { PlanilhaLida } from './ports/leitor-planilha';

/** Quantos erros de linha ficam guardados na importação (o total vai em `invalidas`). */
const MAXIMO_ERROS_GUARDADOS = 20;

type Linha = PlanilhaLida['linhas'][number];

/** O que a preparação precisa, lido uma vez por importação. */
export interface ContextoPreparo {
  cadastros: CadastrosIngestao;
  cortes: TabelaCortes;
  pseudonimo: (texto: string) => string;
}

export interface LinhasPreparadas {
  preparados: LaudoPreparado[];
  /** Linha crua de cada laudo preparado, por identidade. */
  linhasBrutas: Map<string, Record<string, Celula>>;
  pendencias: PendenciaRegistrada[];
  conferidos: { tipo: TipoAviso; chave: string }[];
  errosLinhas: { linha: number; mensagem: string }[];
  invalidas: number;
  /** Identidades das linhas cuja competência calculada ficou de fora (`ignorar`). */
  ignoradas: Set<string>;
}

/**
 * No compartilhamento da MobileMed, só as unidades de destino configuradas (o RPA marcava
 * CRD_APOIO na tela); o relatório traz todas.
 */
export function soUnidadesAceitas<L extends Linha>(
  linhas: L[],
  origem: (l: L) => OrigemLaudo,
  unidades: string[],
): L[] {
  const aceitas = new Set(unidades.map(normalizarNome));
  return linhas.filter(
    (l) =>
      origem(l) !== 'compartilhamento' ||
      aceitas.has(normalizarNome(texto(l.registro.EMPRESA) ?? '')),
  );
}

/**
 * Prepara cada linha (conversão, cadastros, competência, volume, identidade) e junta as pendências
 * de cadastro de todas, com quantos laudos e de que competências. A linha cuja competência
 * calculada `ignorar` diz que fica de fora não entra (nem nas pendências).
 */
export function prepararLinhas<L extends Linha>(
  linhas: L[],
  origem: (l: L) => OrigemLaudo,
  ctx: ContextoPreparo,
  ignorar: (competencia: string) => boolean,
): LinhasPreparadas {
  const preparados: LaudoPreparado[] = [];
  const linhasBrutas = new Map<string, Record<string, Celula>>();
  const pendencias = new Map<string, PendenciaRegistrada>();
  const conferidos = new Map<string, { tipo: TipoAviso; chave: string }>();
  const errosLinhas: { linha: number; mensagem: string }[] = [];
  let invalidas = 0;
  const ignoradas = new Set<string>();

  for (const l of linhas) {
    let preparo: ReturnType<typeof prepararLaudo>;
    try {
      preparo = prepararLaudo(
        converterLinha(l.registro),
        origem(l),
        ctx.cadastros,
        ctx.pseudonimo,
        ctx.cortes,
      );
    } catch (erro) {
      invalidas++;
      if (errosLinhas.length < MAXIMO_ERROS_GUARDADOS) {
        errosLinhas.push({ linha: l.numero, mensagem: (erro as Error).message });
      }
      continue;
    }
    if (ignorar(preparo.laudo.competencia)) {
      ignoradas.add(preparo.laudo.identidade);
      continue;
    }
    preparados.push(preparo.laudo);
    linhasBrutas.set(preparo.laudo.identidade, l.registro);
    const { competencia } = preparo.laudo;
    for (const p of preparo.pendencias) {
      const k = `${p.tipo}:${p.chave}`;
      const antes = pendencias.get(k);
      // Da menor à maior competência dos laudos em que apareceu (a trava do fechamento).
      const desde = antes?.competencias?.desde;
      const ate = antes?.competencias?.ate;
      pendencias.set(k, {
        ...p,
        ocorrencias: (antes?.ocorrencias ?? 0) + 1,
        competencias: {
          desde: desde && desde < competencia ? desde : competencia,
          ate: ate && ate > competencia ? ate : competencia,
        },
      });
    }
    for (const c of preparo.conferidos) conferidos.set(`${c.tipo}:${c.chave}`, c);
  }

  return {
    preparados,
    linhasBrutas,
    pendencias: [...pendencias.values()],
    conferidos: [...conferidos.values()],
    errosLinhas,
    invalidas,
    ignoradas,
  };
}

/** A tipificação de cada laudo, com a competência em que foi calculada. */
export function classificar(
  laudos: LaudoPreparado[],
  tipificar: TipificadorPorCompetencia | null,
): AlteracoesLaudos['classificacoes'] {
  return new Map(
    tipificar
      ? laudos.map((l) => [l.identidade, { ...tipificar(l), competencia: l.competencia }] as const)
      : [],
  );
}
