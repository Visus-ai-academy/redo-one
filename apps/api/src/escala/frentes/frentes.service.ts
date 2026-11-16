import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import {
  ItemEmUsoError,
  ItemNaoEncontradoError,
  NomeEmUsoError,
  ReferenciaInexistenteError,
} from '../../catalogo/comum/catalogo.errors';
import type { Pagina } from '../../catalogo/comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../../catalogo/comum/registro-auditoria';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ConflitoEscalaError } from '../domain/errors';
import { destinoDaFrente } from './frente';
import {
  type DadosFrente,
  FRENTES_REPOSITORY,
  type Frente,
  type FrentesRepository,
} from './frentes.repository';

export const ROTULO_FRENTE = {
  entidade: 'frente_escala',
  singular: 'Frente',
  genero: 'f',
} as const;

/** O que chega para criar ou editar: sem rótulo, vale o nome do catálogo. */
export type EntradaFrente = Omit<DadosFrente, 'rotulo'> & { rotulo: string | null };

/** Frentes da escala: as colunas em que se escala um médico. */
@Injectable()
export class FrentesService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(FRENTES_REPOSITORY) private readonly repo: FrentesRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_FRENTE, auditoria, clock);
  }

  listar(filtro: FiltroLista): Promise<Pagina<Frente>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<Frente> {
    const frente = await this.repo.buscar(id);
    if (!frente) throw new ItemNaoEncontradoError(ROTULO_FRENTE);
    return frente;
  }

  async criar(ator: AtorCatalogo, entrada: EntradaFrente): Promise<string> {
    const dados = await this.validar(entrada, null);
    const id = await this.repo.criar(dados);
    await this.registro.criado(ator, id, dados);
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, entrada: EntradaFrente): Promise<void> {
    const antes = gravados(await this.obter(id));
    const dados = await this.validar(entrada, id);
    const trocouDestino =
      antes.tipo !== dados.tipo ||
      antes.especialidadeId !== dados.especialidadeId ||
      antes.modalidadeId !== dados.modalidadeId;
    if (trocouDestino && (await this.repo.estaEmUso(id))) {
      throw new ConflitoEscalaError(
        'A frente está em uso (turno, alocação, ausência ou recorte de gestora): não dá para trocar a especialidade ou modalidade dela. Crie outra frente e desative esta.',
      );
    }
    await this.repo.atualizar(id, dados);
    await this.registro.alterado(ator, id, antes, dados);
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const antes = gravados(await this.obter(id));
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(ROTULO_FRENTE);
    await this.registro.excluido(ator, id, antes);
  }

  private async validar(entrada: EntradaFrente, idAtual: string | null): Promise<DadosFrente> {
    const destino = destinoDaFrente(entrada);
    const destinoNome = await this.repo.nomeDoDestino(destino);
    if (destinoNome === null) throw new ReferenciaInexistenteError();

    const mesmoDestino = await this.repo.buscarPorDestino(destino);
    if (mesmoDestino && mesmoDestino.id !== idAtual) {
      throw new ConflitoEscalaError(
        `Já existe a frente "${mesmoDestino.rotulo}" para a ${destino.tipo} ${destinoNome}.`,
      );
    }

    const rotulo = entrada.rotulo?.trim() || destinoNome;
    const mesmoRotulo = await this.repo.buscarPorRotulo(rotulo);
    if (mesmoRotulo && mesmoRotulo.id !== idAtual) throw new NomeEmUsoError(ROTULO_FRENTE, rotulo);

    return {
      tipo: entrada.tipo,
      especialidadeId: destino.tipo === 'especialidade' ? destino.id : null,
      modalidadeId: destino.tipo === 'modalidade' ? destino.id : null,
      rotulo,
      descricao: entrada.descricao?.trim() || null,
      cor: entrada.cor?.trim() || null,
      ordem: entrada.ordem,
      ativo: entrada.ativo,
    };
  }
}

/** Só as colunas gravadas (a auditoria não leva o nome do destino, que é do catálogo). */
function gravados({ id: _, destinoNome: __, ...dados }: Frente): DadosFrente {
  return dados;
}
