import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ItemEmUsoError, ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { textoOpcional } from '../comum/documentos';
import { normalizarNome } from '../comum/nomes';
import type { Pagina } from '../comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import {
  type DadosExame,
  EXAMES_REPOSITORY,
  type ExameDetalhe,
  type ExameResumo,
  type ExamesRepository,
  type FiltroExames,
} from './exames.repository';

const ROTULO = { entidade: 'exame', singular: 'Exame', genero: 'm' } as const;
/** Catálogo de exames. As quebras (estudo que vira vários exames) ficam em `catalogo/quebras`. */
@Injectable()
export class ExamesService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(EXAMES_REPOSITORY) private readonly repo: ExamesRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  listar(filtro: FiltroExames): Promise<Pagina<ExameResumo>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<ExameDetalhe> {
    const exame = await this.repo.buscar(id);
    if (!exame) throw new ItemNaoEncontradoError(ROTULO);
    return exame;
  }

  async criar(ator: AtorCatalogo, dados: DadosExame): Promise<string> {
    const validos = limpar(dados);
    const id = await this.repo.criar({
      ...validos,
      chaveNormalizada: normalizarNome(validos.nome),
    });
    await this.registro.criado(ator, id, validos);
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: DadosExame): Promise<void> {
    const { id: _, quebra: __, ...atual } = await this.obter(id);
    const validos = limpar(dados);
    await this.repo.atualizar(id, { ...validos, chaveNormalizada: normalizarNome(validos.nome) });
    await this.registro.alterado(ator, id, atual, validos);
  }

  /**
   * Muda só a subespecialidade (permissão `exames.subespecialidade.editar`), sem tocar nos outros
   * campos. A validação é a mesma da edição completa: o cadastro precisa existir.
   */
  async definirSubespecialidade(
    ator: AtorCatalogo,
    id: string,
    subespecialidadeId: string | null,
  ): Promise<void> {
    const atual = await this.obter(id);
    if (atual.subespecialidadeId === subespecialidadeId) return;
    await this.repo.definirSubespecialidade(id, subespecialidadeId);
    await this.registro.alterado(
      ator,
      id,
      { subespecialidadeId: atual.subespecialidadeId },
      { subespecialidadeId },
    );
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const { id: _, quebra: __, ...atual } = await this.obter(id);
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(ROTULO);
    await this.registro.excluido(ator, id, atual);
  }
}

function limpar(dados: DadosExame): DadosExame {
  return {
    ...dados,
    nome: dados.nome.trim(),
    codigo: textoOpcional(dados.codigo),
    descricao: textoOpcional(dados.descricao),
  };
}
