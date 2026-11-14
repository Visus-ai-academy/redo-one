import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import {
  ItemEmUsoError,
  ItemNaoEncontradoError,
  NomeEmUsoError,
} from '../../catalogo/comum/catalogo.errors';
import { textoOpcional } from '../../catalogo/comum/documentos';
import type { Pagina } from '../../catalogo/comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../../catalogo/comum/registro-auditoria';
import type { ListaRepository } from '../../catalogo/listas/lista.repository';
import { CLOCK, type Clock } from '../../identidade/clock';
import { normalizarNomeMedico } from '../comum/nome-medico';
import { NIVEIS_MEDICO } from '../niveis/tokens';
import {
  IdMobilemedEmUsoError,
  NivelInexistenteError,
  NomeMedicoInvalidoError,
} from './medicos.errors';
import {
  type DadosMedico,
  type FiltroMedicos,
  MEDICOS_REPOSITORY,
  type MedicoDetalhe,
  type MedicoResumo,
  type MedicosRepository,
} from './medicos.repository';

export const ROTULO_MEDICO = { entidade: 'medico', singular: 'Médico', genero: 'm' } as const;

/** Cadastro do médico. Pagamento, apelidos e equipes têm services próprios. */
@Injectable()
export class MedicosService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(MEDICOS_REPOSITORY) private readonly repo: MedicosRepository,
    @Inject(NIVEIS_MEDICO) private readonly niveis: Pick<ListaRepository, 'buscar'>,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_MEDICO, auditoria, clock);
  }

  listar(filtro: FiltroMedicos): Promise<Pagina<MedicoResumo>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<MedicoDetalhe> {
    const medico = await this.repo.buscar(id);
    if (!medico) throw new ItemNaoEncontradoError(ROTULO_MEDICO);
    return medico;
  }

  async criar(ator: AtorCatalogo, dados: DadosMedico): Promise<string> {
    const { chaveNormalizada, ...validos } = await this.validar(dados, null);
    const id = await this.repo.criar({ ...validos, chaveNormalizada });
    await this.registro.criado(ator, id, validos);
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: DadosMedico): Promise<void> {
    const atual = dadosDe(await this.obter(id));
    const { chaveNormalizada, ...validos } = await this.validar(dados, id);
    await this.repo.atualizar(id, { ...validos, chaveNormalizada });
    await this.registro.alterado(ator, id, atual, validos);
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const atual = dadosDe(await this.obter(id));
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(ROTULO_MEDICO);
    await this.registro.excluido(ator, id, atual);
  }

  private async validar(dados: DadosMedico, idAtual: string | null) {
    const nome = dados.nome.trim();
    const chaveNormalizada = normalizarNomeMedico(nome);
    if (!chaveNormalizada) throw new NomeMedicoInvalidoError();
    const mesmoNome = await this.repo.buscarPorChave(chaveNormalizada);
    if (mesmoNome && mesmoNome.id !== idAtual) throw new NomeEmUsoError(ROTULO_MEDICO, nome);

    if (dados.idMobilemed !== null) {
      const dono = await this.repo.buscarPorIdMobilemed(dados.idMobilemed);
      if (dono && dono.id !== idAtual) throw new IdMobilemedEmUsoError(dono.nome);
    }
    if (dados.nivelId && !(await this.niveis.buscar(dados.nivelId))) {
      throw new NivelInexistenteError();
    }

    return {
      ...dados,
      nome,
      chaveNormalizada,
      crm: textoOpcional(dados.crm),
      email: textoOpcional(dados.email)?.toLowerCase() ?? null,
      telefone: textoOpcional(dados.telefone),
      observacoes: textoOpcional(dados.observacoes),
    };
  }
}

function dadosDe({
  id: _,
  nivel,
  aliases: __,
  equipes: ___,
  ...resto
}: MedicoDetalhe): DadosMedico {
  return { ...resto, nivelId: nivel?.id ?? null };
}
