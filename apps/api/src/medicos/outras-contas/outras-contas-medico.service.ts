import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { ItemNaoEncontradoError } from '../../catalogo/comum/catalogo.errors';
import { textoOpcional } from '../../catalogo/comum/documentos';
import { type AtorCatalogo, RegistroAuditoria } from '../../catalogo/comum/registro-auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { IdMobilemedEmUsoError } from '../cadastro/medicos.errors';
import { MEDICOS_REPOSITORY, type MedicosRepository } from '../cadastro/medicos.repository';
import { ROTULO_MEDICO } from '../cadastro/medicos.service';
import { OutraContaEmUsoError, OutraContaInvalidaError } from './outras-contas-medico.errors';
import {
  OUTRAS_CONTAS_MEDICO_REPOSITORY,
  type OutrasContasMedicoRepository,
} from './outras-contas-medico.repository';

const ROTULO_CONTA = { entidade: 'conta_mobilemed', singular: 'Conta', genero: 'f' } as const;

export interface DadosOutraConta {
  idMobilemed: number;
  observacao: string | null;
}

/**
 * Outras contas do médico na MobileMed. O médico entra por uma delas conforme o login do dia; a
 * importação e a carga do robô o reconhecem por qualquer uma, e a atribuição vai sempre para a
 * principal (`medicos.id_mobilemed`). Uma conta é de um médico só (principal ou outra). Toda
 * mudança vai para a auditoria do médico.
 */
@Injectable()
export class OutrasContasMedicoService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(MEDICOS_REPOSITORY)
    private readonly medicos: Pick<MedicosRepository, 'buscar' | 'buscarPorIdMobilemed'>,
    @Inject(OUTRAS_CONTAS_MEDICO_REPOSITORY) private readonly contas: OutrasContasMedicoRepository,
    @Inject(AUDITORIA) private readonly auditoria: Auditoria,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_MEDICO, auditoria, clock);
  }

  async adicionar(ator: AtorCatalogo, medicoId: string, dados: DadosOutraConta): Promise<string> {
    const conta = await this.validar(medicoId, dados);
    const id = await this.contas.criarOutraConta(medicoId, conta);
    await this.registro.registrar(ator, medicoId, 'conta_mobilemed_adicionada', undefined, conta);
    return id;
  }

  /**
   * Conta gravada por um processo do sistema (o mapeamento pelos laudos), com o motivo na
   * auditoria. `false` quando a conta já está neste médico (como principal ou outra).
   */
  async adicionarPeloSistema(medicoId: string, idMobilemed: number, motivo: string) {
    const dono = await this.medicos.buscarPorIdMobilemed(idMobilemed);
    if (dono?.id === medicoId) return false;
    const conta = await this.validar(medicoId, { idMobilemed, observacao: null });
    await this.contas.criarOutraConta(medicoId, conta);
    await this.auditoria.registrar({
      ator: { tipo: 'sistema' },
      entidade: ROTULO_MEDICO.entidade,
      entidadeId: medicoId,
      acao: 'conta_mobilemed_adicionada',
      depois: { ...conta, motivo },
      em: this.clock.now(),
    });
    return true;
  }

  async remover(ator: AtorCatalogo, medicoId: string, contaId: string): Promise<void> {
    const conta = await this.contas.buscarOutraContaDoMedico(medicoId, contaId);
    if (!conta) throw new ItemNaoEncontradoError(ROTULO_CONTA);
    await this.contas.excluirOutraConta(contaId);
    await this.registro.registrar(ator, medicoId, 'conta_mobilemed_removida', {
      idMobilemed: conta.idMobilemed,
      observacao: conta.observacao,
    });
  }

  private async validar(medicoId: string, dados: DadosOutraConta): Promise<DadosOutraConta> {
    if (!(await this.medicos.buscar(medicoId))) throw new ItemNaoEncontradoError(ROTULO_MEDICO);
    if (!Number.isInteger(dados.idMobilemed) || dados.idMobilemed < 1) {
      throw new OutraContaInvalidaError(
        'Informe o ID da conta na MobileMed, um número inteiro positivo.',
      );
    }
    const dono = await this.medicos.buscarPorIdMobilemed(dados.idMobilemed);
    if (dono?.id === medicoId) {
      throw new OutraContaEmUsoError(
        dono.principal
          ? 'Esse ID já é a conta principal deste médico.'
          : 'Essa conta já está em Outras contas deste médico.',
      );
    }
    if (dono) throw new IdMobilemedEmUsoError(dono.nome);
    return { idMobilemed: dados.idMobilemed, observacao: textoOpcional(dados.observacao) };
  }
}
