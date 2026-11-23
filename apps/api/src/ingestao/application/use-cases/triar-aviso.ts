import type { Auditoria } from '../../../auditoria/auditoria';
import type { AcessoAvisos } from '../../domain/avisos-visiveis';
import { TriagemInvalidaError } from '../erros';
import type { ConsultaAvisos, StatusAviso } from '../ports/avisos.consulta';
import { obterAvisoVisivel } from './consultas-simples';

/** Quem tria: só os avisos dos tipos que vê. */
export interface AtorTriagem extends AcessoAvisos {
  usuarioId: string;
}

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

  ignorar(ator: AtorTriagem, id: string, motivo: string) {
    return this.decidir(
      ator,
      id,
      'pendente',
      'ignorado',
      motivo,
      'ignorado',
      'Só um aviso pendente pode ser ignorado.',
    );
  }

  reabrir(ator: AtorTriagem, id: string) {
    return this.decidir(
      ator,
      id,
      'ignorado',
      'pendente',
      null,
      'reaberto',
      'Só um aviso ignorado pode ser reaberto.',
    );
  }

  private async decidir(
    ator: AtorTriagem,
    id: string,
    de: StatusAviso,
    para: StatusAviso,
    motivo: string | null,
    acao: string,
    recusa: string,
  ) {
    const aviso = await obterAvisoVisivel(this.avisos, id, ator);
    const usuarioId = ator.usuarioId;
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
