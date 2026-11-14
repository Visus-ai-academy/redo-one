import type { Auditoria } from '../../auditoria/auditoria';
import type { Clock } from '../../identidade/clock';
import type { Rotulo } from './rotulo';

/** Quem pede a escrita. */
export interface AtorCatalogo {
  usuarioId: string;
}

// Qualquer objeto de dados do catálogo; lido campo a campo.
type Campos = object;

/** Grava os eventos de auditoria de uma entidade do catálogo (toda escrita é auditada). */
export class RegistroAuditoria {
  constructor(
    private readonly rotulo: Rotulo,
    private readonly auditoria: Auditoria,
    private readonly clock: Clock,
  ) {}

  criado(ator: AtorCatalogo, id: string, depois: Campos) {
    return this.registrar(ator, id, 'criado', undefined, depois);
  }

  /** Registra só os campos que mudaram; sem mudança, não registra nada. */
  async alterado(ator: AtorCatalogo, id: string, antes: Campos, depois: Campos) {
    const de = antes as Record<string, unknown>;
    const para = depois as Record<string, unknown>;
    const mudou = Object.keys(para).filter(
      (campo) => JSON.stringify(de[campo]) !== JSON.stringify(para[campo]),
    );
    if (!mudou.length) return;
    const recorte = (campos: Record<string, unknown>) =>
      Object.fromEntries(mudou.map((c) => [c, campos[c]]));
    await this.registrar(ator, id, 'alterado', recorte(de), recorte(para));
  }

  excluido(ator: AtorCatalogo, id: string, antes: Campos) {
    return this.registrar(ator, id, 'excluido', antes);
  }

  private registrar(ator: AtorCatalogo, id: string, acao: string, antes?: Campos, depois?: Campos) {
    return this.auditoria.registrar({
      ator: { tipo: 'usuario', id: ator.usuarioId },
      entidade: this.rotulo.entidade,
      entidadeId: id,
      acao,
      antes: antes as Record<string, unknown> | undefined,
      depois: depois as Record<string, unknown> | undefined,
      em: this.clock.now(),
    });
  }
}
