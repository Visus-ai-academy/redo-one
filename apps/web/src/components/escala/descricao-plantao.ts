import type { ConflitoEscalaDto } from '../../gen/types/ConflitoEscalaDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';

export type ContextoDescricao = {
  /** Nomes do catálogo por id; sem acesso ao catálogo, vazios (vira contagem). */
  prioridades: ReadonlyMap<string, string>;
  subespecialidades: ReadonlyMap<string, string>;
  /** Conflitos da janela; a descrição mostra os deste plantão. */
  conflitos: readonly ConflitoEscalaDto[];
  /** O período da ausência do dia, quando se sabe. */
  ausencia?: { dataInicio: string; dataFim: string };
  /** O ajuste do dia da distribuição deste plantão, se houver. */
  ajusteDistribuicao?: {
    prioridadeIdsLiberadas: readonly string[];
    segueSla: boolean;
    clienteNome: string | null;
  };
};

/** Alocação e dia: a chave dos ajustes do dia de um plantão. */
export const chaveDoPlantao = (alocacaoId: string, data: string) => `${alocacaoId}|${data}`;

export type ItemDescricao = { rotulo: string; valor: string };

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const hora = (iso: string) => iso.slice(11, 16);
const registros = (n: number) => `${n} ${n === 1 ? 'registro' : 'registros'}`;

/** "A, B e C". */
function emLista(nomes: string[]) {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

/** Os nomes que o catálogo conhece e, para os outros, quantos são. */
function nomes(
  ids: readonly string[],
  catalogo: ReadonlyMap<string, string>,
  [um, varios]: [string, string],
  [outra, outras]: [string, string] = ['outra', 'outras'],
) {
  const conhecidos = ids.flatMap((id) => catalogo.get(id) ?? []);
  const outros = ids.length - conhecidos.length;
  if (outros === 0) return conhecidos;
  if (conhecidos.length === 0) return [`${outros} ${outros === 1 ? um : varios}`];
  return [...conhecidos, `${outros} ${outros === 1 ? outra : outras}`];
}

function vigencia(o: OcorrenciaDto) {
  if (o.coberturaDe) return `Cobertura de ${o.coberturaDe.medicoNome}`;
  if (o.gratificado) {
    const cota =
      o.produtividade === null ? 'cota não informada' : `cota de ${registros(o.produtividade)}`;
    return `Gratificado: ${cota}${o.dataFim ? `, até ${diaMes(o.dataFim)}` : ''}`;
  }
  if (o.dataFim) return `Período único até ${diaMes(o.dataFim)}`;
  return `Escala fixa desde ${diaMes(o.dataInicio)}`;
}

function produtividade(o: OcorrenciaDto) {
  if (o.produtividade === null) return 'Não informada';
  if (!o.ajustada) return registros(o.produtividade);
  const escala = o.produtividadeEscala === null ? 'não informada' : o.produtividadeEscala;
  return `${registros(o.produtividade)} neste dia (escala: ${escala})`;
}

/** O que o cartão flutuante de um plantão diz, linha a linha (só as linhas que se aplicam). */
export function descreverPlantao(o: OcorrenciaDto, contexto: ContextoDescricao): ItemDescricao[] {
  const itens: ItemDescricao[] = [
    { rotulo: 'Onde', valor: `${o.frenteRotulo}, ${o.turnoNome}` },
    { rotulo: 'Horário', valor: `${o.horarioInicio}–${o.horarioFim}` },
  ];
  // No gratificado, o número é a cota do período (vai na vigência), não a produtividade do turno.
  if (!o.gratificado) itens.push({ rotulo: 'Produtividade', valor: produtividade(o) });
  itens.push({ rotulo: 'Vigência', valor: vigencia(o) });

  const prioridades = nomes(o.prioridadeIds, contexto.prioridades, ['prioridade', 'prioridades']);
  const subs = [
    ...nomes(
      o.subespecialidadeIds,
      contexto.subespecialidades,
      ['segmento', 'segmentos'],
      ['outro', 'outros'],
    ),
    ...(o.subespecialidadeGeral ? ['Geral'] : []),
  ];
  if (prioridades.length === 0 && subs.length === 0) {
    itens.push({ rotulo: 'Recortes', valor: 'Sem restrição' });
  } else {
    if (prioridades.length > 0) itens.push({ rotulo: 'Prioridades', valor: emLista(prioridades) });
    if (subs.length > 0) itens.push({ rotulo: 'Segmentos', valor: emLista(subs) });
  }

  if (o.coberturaDe)
    itens.push({ rotulo: 'Cobertura', valor: `Cobrindo ${o.coberturaDe.medicoNome}` });
  if (o.cobertoPor)
    itens.push({ rotulo: 'Cobertura', valor: `Coberto por ${o.cobertoPor.medicoNome}` });

  if (o.ausente) {
    const tipo = o.tipoAusenciaNome ?? 'Ausente';
    const periodo = contexto.ausencia
      ? contexto.ausencia.dataInicio === contexto.ausencia.dataFim
        ? `, em ${diaMes(contexto.ausencia.dataInicio)}`
        : `, de ${diaMes(contexto.ausencia.dataInicio)} a ${diaMes(contexto.ausencia.dataFim)}`
      : '';
    itens.push({ rotulo: 'Ausência', valor: `${tipo}${periodo}` });
  }

  const ajuste = contexto.ajusteDistribuicao;
  if (ajuste) {
    const partes: string[] = [];
    const liberadas = nomes(ajuste.prioridadeIdsLiberadas, contexto.prioridades, [
      'prioridade',
      'prioridades',
    ]);
    if (liberadas.length > 0) partes.push(`Aceita também ${emLista(liberadas)}`);
    if (ajuste.segueSla)
      partes.push(partes.length ? 'segue o SLA neste dia' : 'Segue o SLA neste dia');
    if (ajuste.clienteNome) partes.push(`só para ${ajuste.clienteNome}`);
    if (partes.length > 0) itens.push({ rotulo: 'Robô neste dia', valor: partes.join('; ') });
  }

  const outros = contexto.conflitos
    .filter(
      (c) =>
        c.data === o.data && (c.a.alocacaoId === o.alocacaoId || c.b.alocacaoId === o.alocacaoId),
    )
    .map((c) => (c.a.alocacaoId === o.alocacaoId ? c.b : c.a));
  if (outros.length > 0) {
    itens.push({
      rotulo: 'Conflito',
      valor: `Sobrepõe ${outros
        .map((p) => `${p.frenteRotulo}, ${p.turnoNome} (${hora(p.inicio)}–${hora(p.fim)})`)
        .join('; ')}`,
    });
  }
  return itens;
}
