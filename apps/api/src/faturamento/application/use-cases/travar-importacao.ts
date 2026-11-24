import type { Auditoria } from '../../../auditoria/auditoria';
import {
  destravar,
  ImportacaoJaTravadaError,
  ImportacaoNaoTravadaError,
  travar,
} from '../../domain/competencia-status';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import { ENTIDADE_COMPETENCIA, situacaoDa } from './situacao';

const evento = (usuarioId: string, competencia: string, travada: boolean, em: Date) => ({
  ator: { tipo: 'usuario' as const, id: usuarioId },
  entidade: ENTIDADE_COMPETENCIA,
  entidadeId: competencia,
  acao: travada ? 'importacao_travada' : 'importacao_destravada',
  antes: { importacaoTravada: !travada },
  depois: { importacaoTravada: travada },
  em,
});

/** Trava a importação de uma competência, mesmo aberta: os laudos dela deixam de mudar. */
export class TravarImportacao {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, competencia: string): Promise<void> {
    travar((await situacaoDa(this.competencias, competencia)).importacaoTravada);
    const em = this.agora();
    if (!(await this.competencias.travarImportacao(competencia, { usuarioId, em }))) {
      throw new ImportacaoJaTravadaError();
    }
    await this.auditoria.registrar(evento(usuarioId, competencia, true, em));
  }
}

/**
 * Destrava a importação. A competência fechada continua bloqueada pelo status. O repositório
 * enfileira o recálculo junto: os laudos pulados enquanto estava travada ganham o corte atual.
 */
export class DestravarImportacao {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, competencia: string): Promise<void> {
    destravar((await situacaoDa(this.competencias, competencia)).importacaoTravada);
    if (!(await this.competencias.destravarImportacao(competencia))) {
      throw new ImportacaoNaoTravadaError();
    }
    await this.auditoria.registrar(evento(usuarioId, competencia, false, this.agora()));
  }
}
