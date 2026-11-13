import type { Auditoria, EventoAuditoria } from './auditoria';

/** Auditoria em memória para os testes dos services. */
export class InMemoryAuditoria implements Auditoria {
  readonly eventos: EventoAuditoria[] = [];

  async registrar(evento: EventoAuditoria) {
    this.eventos.push(evento);
  }
}
