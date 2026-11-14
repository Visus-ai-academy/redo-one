import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { ItemNaoEncontradoError } from '../../catalogo/comum/catalogo.errors';
import { textoOpcional } from '../../catalogo/comum/documentos';
import { type AtorCatalogo, RegistroAuditoria } from '../../catalogo/comum/registro-auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { MEDICOS_REPOSITORY, type MedicosRepository } from '../cadastro/medicos.repository';
import { ROTULO_MEDICO } from '../cadastro/medicos.service';
import { normalizarNomeMedico } from '../comum/nome-medico';
import { AliasMedicoEmUsoError, AliasMedicoInvalidoError } from './aliases-medico.errors';
import {
  ALIASES_MEDICO_REPOSITORY,
  type AliasesMedicoRepository,
} from './aliases-medico.repository';

const ROTULO_ALIAS = { entidade: 'alias_medico', singular: 'Apelido', genero: 'm' } as const;

export interface DadosAliasMedico {
  nomeOrigem: string;
  observacoes: string | null;
}

/**
 * Apelidos do médico: outras grafias do nome que chegam da MobileMed. A importação compara a
 * grafia normalizada; os apelidos são auditados no médico. Mesmas regras do legado.
 */
@Injectable()
export class AliasesMedicoService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(MEDICOS_REPOSITORY)
    private readonly medicos: Pick<MedicosRepository, 'buscar' | 'buscarPorChave'>,
    @Inject(ALIASES_MEDICO_REPOSITORY) private readonly aliases: AliasesMedicoRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_MEDICO, auditoria, clock);
  }

  async criar(ator: AtorCatalogo, medicoId: string, dados: DadosAliasMedico): Promise<string> {
    if (!(await this.medicos.buscar(medicoId))) throw new ItemNaoEncontradoError(ROTULO_MEDICO);

    const nomeOrigem = dados.nomeOrigem.trim();
    const chaveNormalizada = normalizarNomeMedico(nomeOrigem);
    if (!chaveNormalizada) {
      throw new AliasMedicoInvalidoError('Informe a grafia que vem da origem, com letras.');
    }

    const dono = await this.medicos.buscarPorChave(chaveNormalizada);
    if (dono?.id === medicoId) {
      throw new AliasMedicoInvalidoError(
        'Essa grafia já é a do próprio médico: não precisa de apelido.',
      );
    }
    if (dono) throw new AliasMedicoEmUsoError(`Essa grafia é o nome do médico ${dono.nome}.`);

    const existente = await this.aliases.buscarAlias(chaveNormalizada);
    if (existente) {
      throw new AliasMedicoEmUsoError(
        existente.medicoId === medicoId
          ? 'Esse apelido já existe para este médico.'
          : `Essa grafia já está ligada a ${existente.medicoNome}.`,
      );
    }

    const observacoes = textoOpcional(dados.observacoes);
    const id = await this.aliases.criarAlias(medicoId, {
      nomeOrigem,
      chaveNormalizada,
      observacoes,
    });
    await this.registro.registrar(ator, medicoId, 'alias_criado', undefined, {
      nomeOrigem,
      observacoes,
    });
    return id;
  }

  async excluir(ator: AtorCatalogo, medicoId: string, aliasId: string): Promise<void> {
    const alias = await this.aliases.buscarAliasDoMedico(medicoId, aliasId);
    if (!alias) throw new ItemNaoEncontradoError(ROTULO_ALIAS);
    await this.aliases.excluirAlias(aliasId);
    await this.registro.registrar(ator, medicoId, 'alias_excluido', {
      nomeOrigem: alias.nomeOrigem,
    });
  }
}
