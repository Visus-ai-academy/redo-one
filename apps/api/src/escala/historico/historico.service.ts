import { Inject, Injectable } from '@nestjs/common';

import type { Paginacao } from '../../catalogo/comum/paginacao';
import type { EntidadeEscala } from '../auditoria-escala';
import { ESCOPO_ESCALA_REPOSITORY, type EscopoEscalaRepository } from '../escopo/escopo';
import { PeriodoHistoricoInvalidoError } from './historico.errors';
import {
  HISTORICO_ESCALA_REPOSITORY,
  type HistoricoEscalaRepository,
  type PaginaHistoricoEscala,
} from './historico.repository';

export interface ConsultaHistorico extends Paginacao {
  medicoId?: string;
  entidade?: EntidadeEscala;
  /** `AAAA-MM-DD`, dia de Brasília. */
  de?: string;
  ate?: string;
}

const UM_DIA_MS = 86_400_000;
/** Início do dia em Brasília (UTC-3 fixo, sem horário de verão desde 2019). */
const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`);

/** Histórico da escala (log de alterações), já no recorte de quem consulta. */
@Injectable()
export class HistoricoEscalaService {
  constructor(
    @Inject(HISTORICO_ESCALA_REPOSITORY) private readonly historico: HistoricoEscalaRepository,
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
  ) {}

  async listar(
    principal: { usuarioId: string; acessoTotal: boolean },
    consulta: ConsultaHistorico,
  ): Promise<PaginaHistoricoEscala> {
    const de = consulta.de ? inicioDoDia(consulta.de) : undefined;
    const ateExclusivo = consulta.ate
      ? new Date(inicioDoDia(consulta.ate).getTime() + UM_DIA_MS)
      : undefined;
    if (de && ateExclusivo && de.getTime() >= ateExclusivo.getTime()) {
      throw new PeriodoHistoricoInvalidoError();
    }
    const escopo = principal.acessoTotal ? null : await this.escopos.doUsuario(principal.usuarioId);

    return this.historico.listar({
      ...(consulta.medicoId ? { medicoId: consulta.medicoId } : {}),
      ...(consulta.entidade ? { entidade: consulta.entidade } : {}),
      ...(de ? { de } : {}),
      ...(ateExclusivo ? { ateExclusivo } : {}),
      escopo,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    });
  }
}
