import { Inject, Injectable } from '@nestjs/common';

import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';
import { normalizarNomeMedico } from '../../medicos/comum/nome-medico';
import { MedicoEscalaNaoEncontradoError } from './medicos-escala.errors';
import {
  MEDICOS_ESCALA_REPOSITORY,
  type MedicoEscala,
  type MedicosEscalaRepository,
} from './medicos-escala.repository';

export interface ConsultaMedicosEscala extends Paginacao {
  /** Como digitada: sem acento nem maiúscula importando. */
  busca?: string;
  ativo?: boolean;
}

/**
 * Médicos para a escala escolher (alocar, lançar ausência). Sem o recorte da gestora: ela escala
 * qualquer médico; o recorte vale para turno e frente.
 */
@Injectable()
export class MedicosEscalaService {
  constructor(
    @Inject(MEDICOS_ESCALA_REPOSITORY) private readonly medicos: MedicosEscalaRepository,
  ) {}

  async listar(consulta: ConsultaMedicosEscala): Promise<Pagina<MedicoEscala>> {
    const digitada = consulta.busca?.trim();
    const busca = digitada ? normalizarNomeMedico(digitada) : undefined;
    // Só números ou símbolos: nenhum nome bate, e devolver todos confundiria.
    if (digitada && !busca) return { itens: [], total: 0 };

    return this.medicos.listar({
      ...(busca ? { busca } : {}),
      ...(consulta.ativo !== undefined ? { ativo: consulta.ativo } : {}),
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    });
  }

  async obter(id: string): Promise<MedicoEscala> {
    const medico = await this.medicos.buscar(id);
    if (!medico) throw new MedicoEscalaNaoEncontradoError();
    return medico;
  }
}
