import type { Auditoria } from '../../../auditoria/auditoria';
import { LeituraDePacienteProibidaError } from '../erros';
import type { PacienteDoLaudoLido, PacientesLaudos } from '../ports/pacientes-laudos';

/** Permissão que libera o nome e o código do paciente dos laudos. */
export const PERMISSAO_VER_PACIENTE = 'importacao.paciente.ver';

export interface LeitorDePaciente {
  usuarioId: string;
  /** `temPermissao(principal, PERMISSAO_VER_PACIENTE)`, conferido por quem chama (a tela). */
  podeVerPaciente: boolean;
}

/**
 * Única entrada para o nome e o código do paciente gravados na importação (faturamento, pré-pago,
 * qualidade e pendências mostram, como no dashboards-one). Exige a permissão e cada laudo lido
 * vira um evento de auditoria (`laudo` / `paciente_lido`), sem o nome no evento.
 */
export class LerPacientesDosLaudos {
  constructor(
    private readonly pacientes: PacientesLaudos,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(
    leitor: LeitorDePaciente,
    laudoIds: string[],
  ): Promise<Map<string, PacienteDoLaudoLido>> {
    if (!leitor.podeVerPaciente) throw new LeituraDePacienteProibidaError();
    const ids = [...new Set(laudoIds)];
    if (!ids.length) return new Map();
    const lidos = await this.pacientes.porLaudos(ids);
    const em = this.agora();
    for (const laudoId of lidos.keys()) {
      await this.auditoria.registrar({
        ator: { tipo: 'usuario', id: leitor.usuarioId },
        entidade: 'laudo',
        entidadeId: laudoId,
        acao: 'paciente_lido',
        em,
      });
    }
    return lidos;
  }
}
