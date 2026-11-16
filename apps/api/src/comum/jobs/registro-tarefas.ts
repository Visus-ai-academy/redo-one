import { Injectable } from '@nestjs/common';

/** Recebe o payload do job. Lançar erro faz a fila tentar de novo (com espera crescente). */
export type ExecutarTarefa = (payload: unknown) => Promise<void>;

/**
 * Tarefas que o trabalhador da fila sabe executar. Cada módulo registra as suas no `onModuleInit`,
 * antes de o trabalhador subir (no bootstrap). Toda tarefa precisa ser idempotente.
 */
@Injectable()
export class RegistroTarefas {
  private readonly tarefas = new Map<string, ExecutarTarefa>();
  private readonly agendamentos: string[] = [];

  registrar(nome: string, executar: ExecutarTarefa) {
    if (this.tarefas.has(nome)) throw new Error(`Tarefa "${nome}" registrada duas vezes.`);
    this.tarefas.set(nome, executar);
  }

  listar(): Record<string, ExecutarTarefa> {
    return Object.fromEntries(this.tarefas);
  }

  /**
   * Roda a tarefa periodicamente. `cron` no formato do crontab (minuto hora dia mês dia-da-semana),
   * no fuso do servidor. Com a API fora do ar na hora marcada, aquela execução não acontece.
   */
  agendar(nome: string, cron: string) {
    if (!this.tarefas.has(nome)) throw new Error(`Tarefa "${nome}" não registrada.`);
    // Mesmo formato que o crontab do graphile-worker aceita: sem isso, o trabalhador não sobe.
    if (!/^[_a-zA-Z][_a-zA-Z0-9:_-]*$/.test(nome)) {
      throw new Error(`Tarefa agendada "${nome}": use só letras, números, ":", "_" e "-".`);
    }
    this.agendamentos.push(`${cron} ${nome}`);
  }

  /** Agenda no formato `crontab` do graphile-worker. */
  agenda(): string {
    return this.agendamentos.join('\n');
  }
}
