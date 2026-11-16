import type { Auditoria } from '../../../auditoria/auditoria';
import { AvisoNaoEncontradoError, TriagemInvalidaError } from '../erros';
import type { ConsultaAvisos, StatusAviso } from '../ports/avisos.consulta';

/**
 * Triagem dos avisos de cadastro: ignorar o que não precisa de cadastro (ex.: cliente de teste)
 * e reabrir. O aviso resolvido não passa pela triagem: some sozinho quando o cadastro é feito.
 */
export class TriarAviso {
  constructor(
    private readonly avisos: ConsultaAvisos,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  ignorar(usuarioId: string, id: string, motivo: string | null) {
    return this.decidir(
      usuarioId,
      id,
      'pendente',
      'ignorado',
      motivo,
      'ignorado',
      'Só um aviso pendente pode ser ignorado.',
    );
  }

  reabrir(usuarioId: string, id: string) {
    return this.decidir(
      usuarioId,
      id,
      'ignorado',
      'pendente',
      null,
      'reaberto',
      'Só um aviso ignorado pode ser reaberto.',
    );
  }

  private async decidir(
    usuarioId: string,
    id: string,
    de: StatusAviso,
    para: StatusAviso,
    motivo: string | null,
    acao: string,
    recusa: string,
  ) {
    const aviso = await this.avisos.obter(id);
    if (!aviso) throw new AvisoNaoEncontradoError();
    if (aviso.status !== de) throw new TriagemInvalidaError(recusa);
    const antes = { status: aviso.status, motivo: aviso.motivo };
    const em = this.agora();
    await this.avisos.decidir(id, { status: para, decididoPorId: usuarioId, motivo, em });
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'aviso_cadastro',
      entidadeId: id,
      acao,
      antes,
      depois: { status: para, motivo },
      em,
    });
  }
}
