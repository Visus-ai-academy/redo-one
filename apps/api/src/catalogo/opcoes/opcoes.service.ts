import type { ContratadosRepository } from '../contratados/contratados.repository';
import type { ExamesRepository } from '../exames/exames.repository';
import type { DadosSubespecialidade, ListaRepository } from '../listas/lista.repository';

/** As listas do catálogo são curtas (dezenas de itens); o teto só protege de surpresa. */
const TETO_LISTA = 500;
const TETO_EXAMES = 20;

export interface OpcaoLista {
  id: string;
  nome: string;
  cor: string | null;
}

export interface ListasDoCatalogo {
  modalidades: ListaRepository;
  especialidades: ListaRepository;
  subespecialidades: ListaRepository<DadosSubespecialidade>;
  categoriasExame: ListaRepository;
  prioridades: ListaRepository;
}

/** Itens ativos para os campos de escolha das telas (selects e buscas). */
export class OpcoesService {
  constructor(
    private readonly listasDoCatalogo: ListasDoCatalogo,
    private readonly contratados: Pick<ContratadosRepository, 'listar'>,
    private readonly examesRepo: Pick<ExamesRepository, 'listar'>,
  ) {}

  async listas() {
    const ativos = { ativo: true, pagina: 1, porPagina: TETO_LISTA };
    const opcao = ({ id, nome, cor }: OpcaoLista): OpcaoLista => ({ id, nome, cor });
    const l = this.listasDoCatalogo;
    const [
      modalidades,
      especialidades,
      subespecialidades,
      categoriasExame,
      prioridades,
      contratados,
    ] = await Promise.all([
      l.modalidades.listar(ativos),
      l.especialidades.listar(ativos),
      l.subespecialidades.listar(ativos),
      l.categoriasExame.listar(ativos),
      l.prioridades.listar(ativos),
      this.contratados.listar(ativos),
    ]);
    return {
      modalidades: modalidades.itens.map(opcao),
      especialidades: especialidades.itens.map(opcao),
      subespecialidades: subespecialidades.itens.map((s) => ({
        ...opcao(s),
        especialidadeIds: s.especialidadeIds,
      })),
      categoriasExame: categoriasExame.itens.map(opcao),
      prioridades: prioridades.itens.map(opcao),
      contratados: contratados.itens.map((c) => ({ id: c.id, nome: c.razaoSocial })),
    };
  }

  async exames(busca: string) {
    const { itens } = await this.examesRepo.listar({
      busca: busca || undefined,
      ativo: true,
      pagina: 1,
      porPagina: TETO_EXAMES,
    });
    return itens.map((e) => ({ id: e.id, nome: e.nome, modalidade: e.modalidade?.nome ?? null }));
  }
}
