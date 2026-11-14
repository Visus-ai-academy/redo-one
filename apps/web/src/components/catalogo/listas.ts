import { categoriasExameControllerAtualizar } from '../../gen/clients/categoriasExameControllerAtualizar';
import { categoriasExameControllerCriar } from '../../gen/clients/categoriasExameControllerCriar';
import { categoriasExameControllerExcluir } from '../../gen/clients/categoriasExameControllerExcluir';
import { especialidadesControllerAtualizar } from '../../gen/clients/especialidadesControllerAtualizar';
import { especialidadesControllerCriar } from '../../gen/clients/especialidadesControllerCriar';
import { especialidadesControllerExcluir } from '../../gen/clients/especialidadesControllerExcluir';
import { modalidadesControllerAtualizar } from '../../gen/clients/modalidadesControllerAtualizar';
import { modalidadesControllerCriar } from '../../gen/clients/modalidadesControllerCriar';
import { modalidadesControllerExcluir } from '../../gen/clients/modalidadesControllerExcluir';
import { prioridadesControllerAtualizar } from '../../gen/clients/prioridadesControllerAtualizar';
import { prioridadesControllerCriar } from '../../gen/clients/prioridadesControllerCriar';
import { prioridadesControllerExcluir } from '../../gen/clients/prioridadesControllerExcluir';
import { subespecialidadesControllerAtualizar } from '../../gen/clients/subespecialidadesControllerAtualizar';
import { subespecialidadesControllerCriar } from '../../gen/clients/subespecialidadesControllerCriar';
import { subespecialidadesControllerExcluir } from '../../gen/clients/subespecialidadesControllerExcluir';
import { categoriasExameControllerListarQueryOptions } from '../../gen/hooks/useCategoriasExameControllerListar';
import { categoriasExameControllerObterQueryOptions } from '../../gen/hooks/useCategoriasExameControllerObter';
import { especialidadesControllerListarQueryOptions } from '../../gen/hooks/useEspecialidadesControllerListar';
import { especialidadesControllerObterQueryOptions } from '../../gen/hooks/useEspecialidadesControllerObter';
import { modalidadesControllerListarQueryOptions } from '../../gen/hooks/useModalidadesControllerListar';
import { modalidadesControllerObterQueryOptions } from '../../gen/hooks/useModalidadesControllerObter';
import { prioridadesControllerListarQueryOptions } from '../../gen/hooks/usePrioridadesControllerListar';
import { prioridadesControllerObterQueryOptions } from '../../gen/hooks/usePrioridadesControllerObter';
import { subespecialidadesControllerListarQueryOptions } from '../../gen/hooks/useSubespecialidadesControllerListar';
import { subespecialidadesControllerObterQueryOptions } from '../../gen/hooks/useSubespecialidadesControllerObter';
import type { DadosItemLista, RotulosLista, VarianteLista } from './PainelItemLista';

export type ItemDaLista = DadosItemLista & { id: string };
export type PaginaDaLista = {
  itens: ItemDaLista[];
  total: number;
  pagina: number;
  porPagina: number;
};
export type ConsultaLista = { busca?: string; ativo?: boolean; pagina: number; porPagina: number };

/** Como cada lista se liga à API: as consultas geradas pelo Kubb e as escritas. */
export type ConfigLista = {
  rotuloAba: string;
  rotulos: RotulosLista;
  variante: VarianteLista;
  /** Plural para a busca e a lista vazia ("modalidades"). */
  plural: string;
  // As consultas geradas têm tipos próprios por lista; aqui valem pela forma comum.
  listar: (query: ConsultaLista) => ReturnType<typeof modalidadesControllerListarQueryOptions>;
  obter: (id: string) => ReturnType<typeof modalidadesControllerObterQueryOptions>;
  criar: (dados: DadosItemLista) => Promise<unknown>;
  atualizar: (id: string, dados: DadosItemLista) => Promise<unknown>;
  excluir: (id: string) => Promise<unknown>;
};

const como = <T>(valor: unknown) => valor as T;

export const LISTAS = {
  modalidades: {
    rotuloAba: 'Modalidades',
    plural: 'modalidades',
    variante: 'simples',
    rotulos: {
      singular: 'modalidade',
      genero: 'f',
      campoNome: 'Código',
      exemploNome: 'Ex.: MR',
      exemploDescricao: 'Ex.: Ressonância magnética',
    },
    listar: (query) => modalidadesControllerListarQueryOptions({ query }),
    obter: (id) => modalidadesControllerObterQueryOptions({ path: { id } }),
    criar: (body) => modalidadesControllerCriar({ body }).unwrap(),
    atualizar: (id, body) => modalidadesControllerAtualizar({ path: { id }, body }).unwrap(),
    excluir: (id) => modalidadesControllerExcluir({ path: { id } }).unwrap(),
  },
  especialidades: {
    rotuloAba: 'Especialidades',
    plural: 'especialidades',
    variante: 'simples',
    rotulos: {
      singular: 'especialidade',
      genero: 'f',
      campoNome: 'Nome',
      exemploNome: 'Ex.: NEURO',
      exemploDescricao: 'Ex.: Neurorradiologia',
    },
    listar: (query) => como(especialidadesControllerListarQueryOptions({ query })),
    obter: (id) => como(especialidadesControllerObterQueryOptions({ path: { id } })),
    criar: (body) => especialidadesControllerCriar({ body }).unwrap(),
    atualizar: (id, body) => especialidadesControllerAtualizar({ path: { id }, body }).unwrap(),
    excluir: (id) => especialidadesControllerExcluir({ path: { id } }).unwrap(),
  },
  subespecialidades: {
    rotuloAba: 'Subespecialidades',
    plural: 'subespecialidades',
    variante: 'subespecialidade',
    rotulos: {
      singular: 'subespecialidade',
      genero: 'f',
      campoNome: 'Nome',
      exemploNome: 'Ex.: AVC',
      exemploDescricao: 'Ex.: Acidente vascular cerebral',
    },
    listar: (query) => como(subespecialidadesControllerListarQueryOptions({ query })),
    obter: (id) => como(subespecialidadesControllerObterQueryOptions({ path: { id } })),
    criar: (body) =>
      subespecialidadesControllerCriar({
        body: { ...body, especialidadeIds: body.especialidadeIds ?? [] },
      }).unwrap(),
    atualizar: (id, body) =>
      subespecialidadesControllerAtualizar({
        path: { id },
        body: { ...body, especialidadeIds: body.especialidadeIds ?? [] },
      }).unwrap(),
    excluir: (id) => subespecialidadesControllerExcluir({ path: { id } }).unwrap(),
  },
  categorias: {
    rotuloAba: 'Categorias',
    plural: 'categorias',
    variante: 'simples',
    rotulos: {
      singular: 'categoria',
      genero: 'f',
      campoNome: 'Nome',
      exemploNome: 'Ex.: ANGIO',
      exemploDescricao: 'Ex.: Angiografia',
    },
    listar: (query) => como(categoriasExameControllerListarQueryOptions({ query })),
    obter: (id) => como(categoriasExameControllerObterQueryOptions({ path: { id } })),
    criar: (body) => categoriasExameControllerCriar({ body }).unwrap(),
    atualizar: (id, body) => categoriasExameControllerAtualizar({ path: { id }, body }).unwrap(),
    excluir: (id) => categoriasExameControllerExcluir({ path: { id } }).unwrap(),
  },
  prioridades: {
    rotuloAba: 'Prioridades',
    plural: 'prioridades',
    variante: 'prioridade',
    rotulos: {
      singular: 'prioridade',
      genero: 'f',
      campoNome: 'Nome',
      exemploNome: 'Ex.: URGENTE',
      exemploDescricao: 'Ex.: Pronto-socorro',
    },
    listar: (query) => como(prioridadesControllerListarQueryOptions({ query })),
    obter: (id) => como(prioridadesControllerObterQueryOptions({ path: { id } })),
    criar: (body) =>
      prioridadesControllerCriar({ body: { ...body, urgente: body.urgente ?? false } }).unwrap(),
    atualizar: (id, body) =>
      prioridadesControllerAtualizar({
        path: { id },
        body: { ...body, urgente: body.urgente ?? false },
      }).unwrap(),
    excluir: (id) => prioridadesControllerExcluir({ path: { id } }).unwrap(),
  },
} satisfies Record<string, ConfigLista>;

export type AbaLista = keyof typeof LISTAS;
export const ABAS_LISTAS = Object.keys(LISTAS) as AbaLista[];
