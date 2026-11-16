import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../identidade/clock';
import {
  cancelarSolicitacao,
  EscalaInvalidaError,
  RegistroEscalaNaoEncontradoError,
  validarAusencia,
} from '../domain';
import {
  CadastroInexistenteError,
  ContaSemMedicoError,
  TipoAusenciaInativoError,
} from './ausencias.errors';
import {
  AUSENCIAS_REPOSITORY,
  type AusenciaDetalhada,
  type AusenciasRepository,
  type NovaAusencia,
} from './ausencias.repository';
import { fotoDe } from './ausencias.service';
import { camposDeCriacao, camposDoEvento, eventoAusencia } from './evento-ausencia';

/** Quantas ausências o portal mostra (dashboards-one `minhasAusencias`). */
export const LIMITE_PORTAL = 60;

/** Pedido do médico: sem recorte de frente (vale para todas); turno e dias da semana, sim. */
export interface PedidoAusencia {
  tipoId: string;
  dataInicio: string;
  dataFim: string;
  turnoIds?: string[];
  diasSemana?: number[];
  /** O motivo, obrigatório (mínimo de 3 caracteres). */
  observacoes: string;
}

/** Ausências do médico logado no portal: ver, pedir e cancelar o próprio pedido pendente. */
@Injectable()
export class PortalAusenciasService {
  constructor(
    @Inject(AUSENCIAS_REPOSITORY) private readonly repo: AusenciasRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listar(conta: { usuarioId: string }): Promise<AusenciaDetalhada[]> {
    return this.repo.doMedico(await this.medicoDa(conta), LIMITE_PORTAL);
  }

  async solicitar(conta: { usuarioId: string }, pedido: PedidoAusencia): Promise<string> {
    const medicoId = await this.medicoDa(conta);
    const tipo = await this.repo.tipo(pedido.tipoId);
    if (!tipo) throw new CadastroInexistenteError('tipo');
    if (!tipo.ativo) throw new TipoAusenciaInativoError();
    const validada = validarAusencia({ ...pedido, frenteIds: [], origem: 'medico', tipo });
    if ((await this.repo.turnosExistentes(validada.turnoIds)).length !== validada.turnoIds.length) {
      throw new CadastroInexistenteError('turno');
    }

    const nova: NovaAusencia = {
      id: randomUUID(),
      medicoId,
      tipoId: tipo.id,
      dataInicio: validada.dataInicio,
      dataFim: validada.dataFim,
      diasSemana: validada.diasSemana,
      frenteIds: [],
      turnoIds: [...validada.turnoIds].sort(),
      observacoes: pedido.observacoes.trim(),
      situacao: validada.situacao,
      origem: 'medico',
      solicitadaPorId: conta.usuarioId,
    };
    await this.repo.criar(
      [nova],
      [
        eventoAusencia(conta.usuarioId, nova.id, 'solicitada', this.clock.now(), {
          depois: camposDeCriacao(nova),
        }),
      ],
    );
    return nova.id;
  }

  /** Apaga o próprio pedido enquanto pendente. */
  async cancelar(conta: { usuarioId: string }, id: string): Promise<void> {
    const medicoId = await this.medicoDa(conta);
    const atual = await this.repo.buscar(id);
    if (!atual) throw new RegistroEscalaNaoEncontradoError('Solicitação não encontrada.');
    cancelarSolicitacao({ ...atual, medicoId: atual.medico.id }, medicoId);
    const evento = eventoAusencia(conta.usuarioId, id, 'cancelada', this.clock.now(), {
      antes: camposDoEvento(fotoDe(atual)),
    });
    // Revisada entre a leitura e a escrita: já não é pendente.
    if (!(await this.repo.excluir(id, evento, { somentePendente: true }))) {
      throw new EscalaInvalidaError('Só dá para cancelar uma solicitação pendente.');
    }
  }

  private async medicoDa(conta: { usuarioId: string }): Promise<string> {
    const medicoId = await this.repo.medicoDoUsuario(conta.usuarioId);
    if (!medicoId) throw new ContaSemMedicoError();
    return medicoId;
  }
}
