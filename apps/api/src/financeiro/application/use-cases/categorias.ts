import type { Auditoria } from '../../../auditoria/auditoria';
import type { Pagina } from '../../../catalogo/comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../../../catalogo/comum/registro-auditoria';
import type { Clock } from '../../../identidade/clock';
import {
  type DadosCategoria,
  prepararCategoria,
  type TipoCategoria,
} from '../../domain/categoria-financeira';
import { DadoEmUsoError, EmUsoError, NaoEncontradoError } from '../../domain/erros';
import type {
  Categoria,
  CategoriasRepository,
  FiltroCategorias,
} from '../ports/categorias.repository';

export type Ator = AtorCatalogo;

const ROTULO = {
  entidade: 'categoria_financeira',
  singular: 'Categoria financeira',
  genero: 'f',
} as const;

async function exigir(repo: CategoriasRepository, id: string): Promise<Categoria> {
  const categoria = await repo.buscar(id);
  if (!categoria) throw new NaoEncontradoError('Categoria financeira não encontrada.');
  return categoria;
}

/** Só os campos que a pessoa edita (o que a auditoria compara). */
const editaveis = ({
  tipo,
  nome,
  paiId,
  codigoContabil,
  ativa,
}: DadosCategoria): DadosCategoria => ({
  tipo,
  nome,
  paiId,
  codigoContabil,
  ativa,
});

/** Lista em árvore, um item e as opções das listas de escolha. */
export class ConsultarCategorias {
  constructor(private readonly repo: CategoriasRepository) {}

  listar(filtro: FiltroCategorias): Promise<Pagina<Categoria>> {
    return this.repo.listar(filtro);
  }

  obter(id: string): Promise<Categoria> {
    return exigir(this.repo, id);
  }

  opcoes(tipo?: TipoCategoria): Promise<Categoria[]> {
    return this.repo.opcoes(tipo);
  }
}

/** Criar e editar uma categoria; toda escrita é auditada. */
export class SalvarCategoria {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: CategoriasRepository,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async criar(ator: Ator, entrada: DadosCategoria): Promise<string> {
    const dados = await this.validar(entrada, null);
    const id = await this.repo.criar(dados);
    await this.registro.criado(ator, id, dados);
    return id;
  }

  async atualizar(ator: Ator, id: string, entrada: DadosCategoria): Promise<void> {
    const atual = await exigir(this.repo, id);
    const dados = await this.validar(entrada, atual);
    await this.repo.atualizar(id, dados);
    await this.registro.alterado(ator, id, editaveis(atual), dados);
  }

  private async validar(entrada: DadosCategoria, atual: Categoria | null) {
    const pai = entrada.paiId ? await this.repo.buscar(entrada.paiId) : null;
    const dados = prepararCategoria(entrada, {
      id: atual?.id,
      pai,
      temFilhas: (atual?.totalFilhas ?? 0) > 0,
      tipoAtual: atual?.tipo,
    });
    const mesmoNome = await this.repo.buscarPorNome(dados.tipo, dados.paiId, dados.nome);
    if (mesmoNome && mesmoNome.id !== atual?.id) {
      throw new DadoEmUsoError(
        'nome',
        `Já existe a categoria "${dados.nome}" ${dados.paiId ? 'neste grupo' : 'no nível de cima'}.`,
      );
    }
    return dados;
  }
}

/** Excluir só a categoria sem uso; a em uso se desativa. */
export class ExcluirCategoria {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: CategoriasRepository,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async executar(ator: Ator, id: string): Promise<void> {
    const atual = await exigir(this.repo, id);
    if (!(await this.repo.excluir(id))) {
      throw new EmUsoError(
        'A categoria está em uso (tem categorias dentro, fornecedores ou títulos). Desative-a em vez de excluir.',
      );
    }
    await this.registro.excluido(ator, id, editaveis(atual));
  }
}
