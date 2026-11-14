import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ItemEmUsoError, ItemNaoEncontradoError, NomeEmUsoError } from '../comum/catalogo.errors';
import { documentoOpcional, textoOpcional, ufOpcional } from '../comum/documentos';
import type { Pagina } from '../comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import type { FiltroLista } from '../listas/lista.repository';
import { CnpjEmUsoError, RepasseEmCadeiaError, RepasseInvalidoError } from './contratados.errors';
import {
  CONTRATADOS_REPOSITORY,
  type Contratado,
  type ContratadosRepository,
  type DadosContratado,
} from './contratados.repository';

const ROTULO = { entidade: 'contratado', singular: 'Contratado', genero: 'm' } as const;

/** Cadastro básico do contratado (emissora). Omie e signatários entram com faturamento e contratos. */
@Injectable()
export class ContratadosService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(CONTRATADOS_REPOSITORY) private readonly repo: ContratadosRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  listar(filtro: FiltroLista): Promise<Pagina<Contratado>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<Contratado> {
    const contratado = await this.repo.buscar(id);
    if (!contratado) throw new ItemNaoEncontradoError(ROTULO);
    return contratado;
  }

  async criar(ator: AtorCatalogo, dados: DadosContratado): Promise<string> {
    const validos = await this.validar(dados, null);
    const id = await this.repo.criar(validos);
    await this.registro.criado(ator, id, validos);
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: DadosContratado): Promise<void> {
    const { id: _, contratadoRepasseNome: __, ...atual } = await this.obter(id);
    const validos = await this.validar(dados, id);
    await this.repo.atualizar(id, validos);
    await this.registro.alterado(ator, id, atual, validos);
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const { id: _, contratadoRepasseNome: __, ...atual } = await this.obter(id);
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(ROTULO);
    await this.registro.excluido(ator, id, atual);
  }

  private async validar(dados: DadosContratado, idAtual: string | null): Promise<DadosContratado> {
    const razaoSocial = dados.razaoSocial.trim();
    const mesmoNome = await this.repo.buscarPorRazaoSocial(razaoSocial);
    if (mesmoNome && mesmoNome.id !== idAtual) throw new NomeEmUsoError(ROTULO, razaoSocial);

    const cnpj = documentoOpcional(dados.cnpj, 14, 'O CNPJ tem 14 dígitos.');
    if (cnpj) {
      const mesmoCnpj = await this.repo.buscarPorCnpj(cnpj);
      if (mesmoCnpj && mesmoCnpj.id !== idAtual) throw new CnpjEmUsoError();
    }

    const contratadoRepasseId = dados.contratadoRepasseId || null;
    if (contratadoRepasseId) await this.validarRepasse(contratadoRepasseId, idAtual, razaoSocial);

    return {
      razaoSocial,
      cnpj,
      endereco: textoOpcional(dados.endereco),
      cidade: textoOpcional(dados.cidade),
      uf: ufOpcional(dados.uf),
      cep: documentoOpcional(dados.cep, 8, 'O CEP tem 8 dígitos.'),
      contratadoRepasseId,
      ativo: dados.ativo,
    };
  }

  /** A consolidação é de um passo: o motor de repasse não segue cadeias (A → B → C). */
  private async validarRepasse(alvoId: string, idAtual: string | null, razaoSocial: string) {
    if (alvoId === idAtual) {
      throw new RepasseInvalidoError(
        'O contratado não pode consolidar o repasse nele mesmo: deixe em branco.',
      );
    }
    const alvo = await this.repo.buscar(alvoId);
    if (!alvo) throw new RepasseInvalidoError('Contratado de repasse não encontrado.');
    if (alvo.contratadoRepasseId) {
      throw new RepasseEmCadeiaError(
        `${alvo.razaoSocial} já consolida em outro contratado: aponte direto para o consolidador final.`,
      );
    }
    const consolidados = idAtual ? await this.repo.consolidadosEm(idAtual) : [];
    if (consolidados.length) {
      throw new RepasseEmCadeiaError(
        `${consolidados.join(', ')} ${consolidados.length === 1 ? 'consolida' : 'consolidam'} em ` +
          `${razaoSocial}: ${razaoSocial} não pode consolidar em outro contratado.`,
      );
    }
  }
}
