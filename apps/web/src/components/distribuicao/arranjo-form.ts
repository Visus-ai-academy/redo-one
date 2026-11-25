import { z } from 'zod';

import type { ArranjoDto } from '../../gen/types/ArranjoDto';
import type { ModoVinculoKey } from '../../gen/types/ModoVinculo';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { GERAL } from '../escala/alocacao-form';
import { esquemaCaixasComTodas } from '../form/caixas-todas';

/** Dono do arranjo: só o do médico tem clínica exclusiva. */
export type DonoArranjo = 'medico' | 'equipe';

export type ValoresArranjo = {
  /** A frente: `E:<especialidade>` ou `M:<modalidade>`; vazia até escolher (obrigatória). */
  frente: string;
  /** Só na frente de modalidade; vazia = todas. */
  especialidadeIds: string[];
  /** Só na frente de especialidade; vazia = todas. */
  modalidadeIds: string[];
  /** Só na frente de especialidade. Com `GERAL` para o exame sem subespecialidade. */
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
  frente: '',
  especialidadeIds: [],
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

export type FrenteDoArranjo = { tipo: 'especialidade' | 'modalidade'; id: string };

/** Chave da frente no select (`E:` especialidade, `M:` modalidade), como na aba do cliente. */
export const chaveDaFrente = (a: Pick<ArranjoDto, 'especialidadeId' | 'modalidadeId'>) =>
  a.especialidadeId ? `E:${a.especialidadeId}` : a.modalidadeId ? `M:${a.modalidadeId}` : '';

export function frenteDaChave(chave: string): FrenteDoArranjo | null {
  const [tipo, id] = [chave.slice(0, 2), chave.slice(2)];
  if (!id) return null;
  if (tipo === 'E:') return { tipo: 'especialidade', id };
  if (tipo === 'M:') return { tipo: 'modalidade', id };
  return null;
}

const opcoes = (ids: string[], nomes: RotuloDto[]): OpcaoBusca[] =>
  ids.map((id) => ({ valor: id, rotulo: nomes.find((n) => n.id === id)?.nome ?? 'Inativo' }));

export function valoresDoArranjo(
  arranjo: ArranjoDto | undefined,
  nomes: NomesDoArranjo,
): ValoresArranjo {
  if (!arranjo) return ARRANJO_VAZIO;
  return {
    frente: chaveDaFrente(arranjo),
    especialidadeIds: arranjo.especialidadeIds,
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

/** Do formulário para a API: só o recorte que vale na frente escolhida vai. */
export function paraApi(v: ValoresArranjo, dono: DonoArranjo = 'medico'): ArranjoDto {
  const frente = frenteDaChave(v.frente);
  const daEspecialidade = frente?.tipo === 'especialidade';
  const daModalidade = frente?.tipo === 'modalidade';
  return {
    especialidadeId: daEspecialidade ? frente.id : null,
    modalidadeId: daModalidade ? frente.id : null,
    especialidadeIds: daModalidade ? v.especialidadeIds : [],
    modalidadeIds: daEspecialidade ? v.modalidadeIds : [],
    subespecialidadeIds: daEspecialidade ? v.subespecialidadeIds.filter((id) => id !== GERAL) : [],
    subespecialidadeGeral: daEspecialidade && v.subespecialidadeIds.includes(GERAL),
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
    frente: z.string(),
    especialidadeIds: z.array(z.string()),
    modalidadeIds: z.array(z.string()),
    subespecialidadeIds: z.array(z.string()),
    prioridadeIds: esquemaCaixasComTodas('Marque ao menos uma prioridade.'),
    modoClientes: modo,
    clientes: z.array(opcao),
    modoExames: modo,
    exames: z.array(opcao),
    clientesExclusivos: z.array(opcao),
  })
  .superRefine((v, ctx) => {
    const erro = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!frenteDaChave(v.frente)) erro('frente', 'Escolha a frente.');
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

/** Do catálogo: na ordem dele (a mesma do formulário), com os que saíram no fim. */
const nomesNaOrdemDe = (ids: string[], catalogo: RotuloDto[], ausente: string) => [
  ...catalogo.filter((item) => ids.includes(item.id)).map((item) => item.nome),
  ...ids.filter((id) => !catalogo.some((item) => item.id === id)).map(() => ausente),
];

/** Clientes e exames não têm catálogo no formulário: em ordem alfabética, com os que saíram no fim. */
const nomesEmOrdemAlfabetica = (ids: string[], lista: RotuloDto[], ausente: string) =>
  nomesNaOrdemDe(
    ids,
    [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    ausente,
  );

function vinculo(modoAtual: ModoVinculoKey, nomes: string[]) {
  return modoAtual === 'apenas' ? `Só ${listar(nomes)}` : `Todos, exceto ${listar(nomes)}`;
}

/**
 * O arranjo em linhas legíveis para o cartão. O título é a frente com o recorte da outra dimensão
 * ("RX · MI, MSK"); as linhas, só os eixos recortados, além da prioridade.
 */
export function resumoDoArranjo(
  a: ArranjoDto,
  catalogo: CatalogoDoArranjo,
  nomes: NomesDoArranjo,
): { titulo: string; linhas: { rotulo: string; valor: string }[] } {
  const linhas: { rotulo: string; valor: string }[] = [];
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
      valor: vinculo(
        a.modoClientes,
        nomesEmOrdemAlfabetica(a.clienteIds, nomes.clientes, 'Inativo'),
      ),
    });
  }
  if (a.modoExames !== 'todos') {
    linhas.push({
      rotulo: 'Exames',
      valor: vinculo(a.modoExames, nomesEmOrdemAlfabetica(a.exameIds, nomes.exames, 'Inativo')),
    });
  }
  if (a.clientesExclusivosIds.length) {
    linhas.push({
      rotulo: 'Clínicas exclusivas',
      valor: listar(nomesEmOrdemAlfabetica(a.clientesExclusivosIds, nomes.clientes, 'Inativo')),
    });
  }
  return { titulo: tituloDoArranjo(a, catalogo), linhas };
}

function tituloDoArranjo(a: ArranjoDto, catalogo: CatalogoDoArranjo): string {
  if (a.modalidadeId) {
    const frente =
      catalogo.modalidades.find((m) => m.id === a.modalidadeId)?.nome ?? 'Modalidade inativa';
    const recorte = a.especialidadeIds.length
      ? listar(nomesNaOrdemDe(a.especialidadeIds, catalogo.especialidades, 'Inativa'))
      : 'todas as especialidades';
    return `${frente} · ${recorte}`;
  }
  if (!a.especialidadeId) return 'Sem frente';
  const frente =
    catalogo.especialidades.find((e) => e.id === a.especialidadeId)?.nome ??
    'Especialidade inativa';
  const recorte = a.modalidadeIds.length
    ? listar(nomesNaOrdemDe(a.modalidadeIds, catalogo.modalidades, 'Inativa'))
    : 'todas as modalidades';
  return `${frente} · ${recorte}`;
}
