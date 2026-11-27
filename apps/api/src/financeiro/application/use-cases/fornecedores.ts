import type { Auditoria } from '../../../auditoria/auditoria';
import type { Pagina } from '../../../catalogo/comum/paginacao';
import { RegistroAuditoria } from '../../../catalogo/comum/registro-auditoria';
import type { Clock } from '../../../identidade/clock';
import { DadoEmUsoError, EmUsoError, NaoEncontradoError } from '../../domain/erros';
import { type DadosFornecedor, prepararFornecedor } from '../../domain/fornecedor';
import type { CategoriasRepository } from '../ports/categorias.repository';
import type {
  FiltroFornecedores,
  Fornecedor,
  FornecedoresRepository,
  FornecedorItem,
} from '../ports/fornecedores.repository';
import type { Ator } from './categorias';

const ROTULO = { entidade: 'fornecedor', singular: 'Fornecedor', genero: 'm' } as const;

async function exigir(repo: FornecedoresRepository, id: string): Promise<Fornecedor> {
  const fornecedor = await repo.buscar(id);
  if (!fornecedor) throw new NaoEncontradoError('Fornecedor não encontrado.');
  return fornecedor;
}

/** Só os campos que a pessoa edita (o que a auditoria compara). */
function editaveis({ id: _, categoriaPadraoNome: __, ...dados }: Fornecedor): DadosFornecedor {
  return dados;
}

export class ConsultarFornecedores {
  constructor(private readonly repo: FornecedoresRepository) {}

  listar(filtro: FiltroFornecedores): Promise<Pagina<FornecedorItem>> {
    return this.repo.listar(filtro);
  }

  obter(id: string): Promise<Fornecedor> {
    return exigir(this.repo, id);
  }
}

/** Criar e editar o fornecedor; o CNPJ e o CPF não se repetem. Toda escrita é auditada. */
export class SalvarFornecedor {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: FornecedoresRepository,
    private readonly categorias: Pick<CategoriasRepository, 'buscar'>,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async criar(ator: Ator, entrada: DadosFornecedor): Promise<string> {
    const dados = await this.validar(entrada, null);
    const id = await this.repo.criar(dados);
    await this.registro.criado(ator, id, dados);
    return id;
  }

  async atualizar(ator: Ator, id: string, entrada: DadosFornecedor): Promise<void> {
    const atual = await exigir(this.repo, id);
    const dados = await this.validar(entrada, id);
    await this.repo.atualizar(id, dados);
    await this.registro.alterado(ator, id, editaveis(atual), dados);
  }

  private async validar(entrada: DadosFornecedor, idAtual: string | null) {
    const categoria = entrada.categoriaPadraoId
      ? await this.categorias.buscar(entrada.categoriaPadraoId)
      : null;
    const dados = prepararFornecedor(entrada, { categoria });
    const documento = dados.cnpj ? { cnpj: dados.cnpj } : { cpf: dados.cpf ?? '' };
    const outro = await this.repo.buscarPorDocumento(documento);
    if (outro && outro.id !== idAtual) {
      const campo = dados.cnpj ? 'cnpj' : 'cpf';
      throw new DadoEmUsoError(
        campo,
        `O ${campo.toUpperCase()} já é do fornecedor ${outro.razaoSocial}.`,
      );
    }
    return dados;
  }
}

/** Excluir só o fornecedor sem títulos; o com títulos se desativa. */
export class ExcluirFornecedor {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: FornecedoresRepository,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async executar(ator: Ator, id: string): Promise<void> {
    const atual = await exigir(this.repo, id);
    if (!(await this.repo.excluir(id))) {
      throw new EmUsoError('O fornecedor tem títulos lançados. Desative-o em vez de excluir.');
    }
    await this.registro.excluido(ator, id, editaveis(atual));
  }
}
