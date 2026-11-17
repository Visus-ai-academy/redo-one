import { z } from 'zod';

import type { ArranjoDto } from '../../gen/types/ArranjoDto';
import type { ModoVinculoKey } from '../../gen/types/ModoVinculo';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { GERAL } from '../escala/alocacao-form';

/** Dono do arranjo: só o do médico tem clínica exclusiva. */
export type DonoArranjo = 'medico' | 'equipe';

export type ValoresArranjo = {
  /** Vazio = todas as especialidades. */
  especialidadeId: string;
  modalidadeIds: string[];
  /** Com `GERAL` para o exame sem subespecialidade. */
  subespecialidadeIds: string[];
  prioridadeIds: string[];
  modoClientes: ModoVinculoKey;
  clientes: OpcaoBusca[];
  modoExames: ModoVinculoKey;
  exames: OpcaoBusca[];
  clientesExclusivos: OpcaoBusca[];
};

/** Nomes dos clientes e exames marcados, como a API devolve junto dos arranjos. */
export type NomesDoArranjo = { clientes: RotuloDto[]; exames: RotuloDto[] };

/** Nomes do catálogo para o resumo do cartão. */
export type CatalogoDoArranjo = {
  especialidades: RotuloDto[];
  modalidades: RotuloDto[];
  subespecialidades: RotuloDto[];
  prioridades: RotuloDto[];
};

export const ARRANJO_VAZIO: ValoresArranjo = {
  especialidadeId: '',
  modalidadeIds: [],
  subespecialidadeIds: [],
  prioridadeIds: [],
  modoClientes: 'todos',
  clientes: [],
  modoExames: 'todos',
  exames: [],
  clientesExclusivos: [],
};

export const OPCOES_MODO_CLIENTES = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'apenas', rotulo: 'Só estes' },
  { valor: 'exceto', rotulo: 'Todos, exceto estes' },
];

const opcoes = (ids: string[], nomes: RotuloDto[]): OpcaoBusca[] =>
  ids.map((id) => ({ valor: id, rotulo: nomes.find((n) => n.id === id)?.nome ?? 'Inativo' }));

export function valoresDoArranjo(
  arranjo: ArranjoDto | undefined,
  nomes: NomesDoArranjo,
): ValoresArranjo {
  if (!arranjo) return ARRANJO_VAZIO;
  return {
    especialidadeId: arranjo.especialidadeId ?? '',
    modalidadeIds: arranjo.modalidadeIds,
    subespecialidadeIds: [
      ...arranjo.subespecialidadeIds,
      ...(arranjo.subespecialidadeGeral ? [GERAL] : []),
    ],
    prioridadeIds: arranjo.prioridadeIds,
    modoClientes: arranjo.modoClientes,
    clientes: opcoes(arranjo.clienteIds, nomes.clientes),
    modoExames: arranjo.modoExames,
    exames: opcoes(arranjo.exameIds, nomes.exames),
    clientesExclusivos: opcoes(arranjo.clientesExclusivosIds, nomes.clientes),
  };
}

const ids = (lista: OpcaoBusca[]) => lista.map((o) => o.valor);

/** Do formulário para a API. */
export function paraApi(v: ValoresArranjo, dono: DonoArranjo = 'medico'): ArranjoDto {
  return {
    especialidadeId: v.especialidadeId || null,
    modalidadeIds: v.modalidadeIds,
    subespecialidadeIds: v.subespecialidadeIds.filter((id) => id !== GERAL),
    subespecialidadeGeral: v.subespecialidadeIds.includes(GERAL),
    prioridadeIds: v.prioridadeIds,
    modoClientes: v.modoClientes,
    clienteIds: v.modoClientes === 'todos' ? [] : ids(v.clientes),
    modoExames: v.modoExames,
    exameIds: v.modoExames === 'todos' ? [] : ids(v.exames),
    clientesExclusivosIds: dono === 'equipe' ? [] : ids(v.clientesExclusivos),
  };
}

/** O arranjo atende o cliente pela lista e pelo modo dele? (mesma regra da API) */
export function atendeCliente(v: Pick<ValoresArranjo, 'modoClientes' | 'clientes'>, id: string) {
  if (v.modoClientes === 'todos') return true;
  const naLista = v.clientes.some((c) => c.valor === id);
  return v.modoClientes === 'apenas' ? naLista : !naLista;
}

const opcao = z.object({ valor: z.string(), rotulo: z.string() });
const modo = z.enum(['todos', 'apenas', 'exceto']);

export const esquemaArranjo = z
  .object({
    especialidadeId: z.string(),
    modalidadeIds: z.array(z.string()),
    subespecialidadeIds: z.array(z.string()),
    prioridadeIds: z.array(z.string()),
    modoClientes: modo,
    clientes: z.array(opcao),
    modoExames: modo,
    exames: z.array(opcao),
    clientesExclusivos: z.array(opcao),
  })
  .superRefine((v, ctx) => {
    const erro = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.modoClientes === 'apenas' && v.clientes.length === 0)
      erro('clientes', 'Escolha ao menos um cliente.');
    if (v.modoExames === 'apenas' && v.exames.length === 0)
      erro('exames', 'Escolha ao menos um exame.');
    const fora = v.clientesExclusivos.filter((c) => !atendeCliente(v, c.valor));
    if (fora.length)
      erro(
        'clientesExclusivos',
        `${fora.map((c) => c.rotulo).join(', ')} não ${fora.length > 1 ? 'estão' : 'está'} entre os clientes deste arranjo.`,
      );
  });

const MAX_NOMES = 3;

/** "A, B, C e mais 2". */
function listar(nomes: string[]) {
  const primeiros = nomes.slice(0, MAX_NOMES).join(', ');
  return nomes.length > MAX_NOMES ? `${primeiros} e mais ${nomes.length - MAX_NOMES}` : primeiros;
}

const nomesDe = (ids: string[], lista: RotuloDto[], ausente: string) =>
  ids.map((id) => lista.find((item) => item.id === id)?.nome ?? ausente);

/** Do catálogo: na ordem dele (a mesma do formulário), com os que saíram no fim. */
const nomesNaOrdemDe = (ids: string[], catalogo: RotuloDto[], ausente: string) => [
  ...catalogo.filter((item) => ids.includes(item.id)).map((item) => item.nome),
  ...ids.filter((id) => !catalogo.some((item) => item.id === id)).map(() => ausente),
];

function vinculo(modoAtual: ModoVinculoKey, nomes: string[]) {
  return modoAtual === 'apenas' ? `Só ${listar(nomes)}` : `Todos, exceto ${listar(nomes)}`;
}

/** O arranjo em linhas legíveis para o cartão: só os eixos recortados, além de modalidade e prioridade. */
export function resumoDoArranjo(
  a: ArranjoDto,
  catalogo: CatalogoDoArranjo,
  nomes: NomesDoArranjo,
): { titulo: string; linhas: { rotulo: string; valor: string }[] } {
  const linhas: { rotulo: string; valor: string }[] = [];
  linhas.push({
    rotulo: 'Modalidades',
    valor: a.modalidadeIds.length
      ? listar(nomesNaOrdemDe(a.modalidadeIds, catalogo.modalidades, 'Inativa'))
      : 'Todas',
  });
  if (a.subespecialidadeIds.length || a.subespecialidadeGeral) {
    linhas.push({
      rotulo: 'Segmentos',
      valor: listar([
        ...nomesNaOrdemDe(a.subespecialidadeIds, catalogo.subespecialidades, 'Inativa'),
        ...(a.subespecialidadeGeral ? ['Geral (sem segmento)'] : []),
      ]),
    });
  }
  linhas.push({
    rotulo: 'Prioridades',
    valor: a.prioridadeIds.length
      ? listar(nomesNaOrdemDe(a.prioridadeIds, catalogo.prioridades, 'Inativa'))
      : 'Todas',
  });
  if (a.modoClientes !== 'todos') {
    linhas.push({
      rotulo: 'Clientes',
      valor: vinculo(a.modoClientes, nomesDe(a.clienteIds, nomes.clientes, 'Inativo')),
    });
  }
  if (a.modoExames !== 'todos') {
    linhas.push({
      rotulo: 'Exames',
      valor: vinculo(a.modoExames, nomesDe(a.exameIds, nomes.exames, 'Inativo')),
    });
  }
  if (a.clientesExclusivosIds.length) {
    linhas.push({
      rotulo: 'Clínicas exclusivas',
      valor: listar(nomesDe(a.clientesExclusivosIds, nomes.clientes, 'Inativo')),
    });
  }
  const especialidade = a.especialidadeId
    ? (catalogo.especialidades.find((e) => e.id === a.especialidadeId)?.nome ??
      'Especialidade inativa')
    : 'Todas as especialidades';
  return { titulo: especialidade, linhas };
}
