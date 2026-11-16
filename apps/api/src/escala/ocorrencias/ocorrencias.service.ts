import { Inject, Injectable } from '@nestjs/common';

import {
  AcaoProibidaEscalaError,
  diasNoIntervalo,
  EscalaInvalidaError,
  validarData,
} from '../domain';
import { ESCOPO_ESCALA_REPOSITORY, type EscopoEscalaRepository } from '../escopo/escopo';
import {
  type ConsultaOcorrencias,
  OCORRENCIAS_ESCALA,
  type ResultadoOcorrencias,
} from './consulta-ocorrencias';
import {
  MEDICO_DO_USUARIO_REPOSITORY,
  type MedicoDoUsuarioRepository,
} from './medico-do-usuario.repository';

/** Janela máxima das rotas de ocorrências: dois meses cheios (a expansão aceita mais). */
export const JANELA_MAXIMA_ROTA_DIAS = 62;

export interface Janela {
  de: string;
  ate: string;
}

export interface ConsultaDaTela extends Janela {
  medicoId?: string;
  turnoIds?: string[];
  frenteIds?: string[];
}

/** Quem consulta: o recorte vale para quem não tem acesso total. */
export interface Consultante {
  usuarioId: string;
  acessoTotal: boolean;
}

@Injectable()
export class OcorrenciasService {
  constructor(
    @Inject(OCORRENCIAS_ESCALA) private readonly consulta: ConsultaOcorrencias,
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
    @Inject(MEDICO_DO_USUARIO_REPOSITORY) private readonly medicos: MedicoDoUsuarioRepository,
  ) {}

  /** Ocorrências da escala no recorte de quem consulta. */
  async listar(quem: Consultante, consulta: ConsultaDaTela): Promise<ResultadoOcorrencias> {
    validarJanela(consulta);
    const escopo = quem.acessoTotal ? null : await this.escopos.doUsuario(quem.usuarioId);
    return this.consulta.listar(consulta.de, consulta.ate, {
      medicoId: consulta.medicoId,
      turnoIds: consulta.turnoIds,
      frenteIds: consulta.frenteIds,
      escopo,
    });
  }

  /** Portal: a escala do médico vinculado à conta. */
  async minhaEscala(usuarioId: string, janela: Janela): Promise<ResultadoOcorrencias> {
    validarJanela(janela);
    const medicoId = await this.medicos.doUsuario(usuarioId);
    if (!medicoId) {
      throw new AcaoProibidaEscalaError('Sua conta não está vinculada a um médico.');
    }
    return this.consulta.listar(janela.de, janela.ate, { medicoId });
  }
}

function validarJanela({ de, ate }: Janela) {
  const inicio = validarData(de);
  const fim = validarData(ate);
  if (fim < inicio) throw new EscalaInvalidaError('Período inválido: o fim é antes do início.');
  if (diasNoIntervalo(inicio, fim) > JANELA_MAXIMA_ROTA_DIAS) {
    throw new EscalaInvalidaError(
      `Período grande demais: consulte no máximo ${JANELA_MAXIMA_ROTA_DIAS} dias.`,
    );
  }
}
