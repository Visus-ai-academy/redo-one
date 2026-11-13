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

  registrar(nome: string, executar: ExecutarTarefa) {
    if (this.tarefas.has(nome)) throw new Error(`Tarefa "${nome}" registrada duas vezes.`);
    this.tarefas.set(nome, executar);
  }

  listar(): Record<string, ExecutarTarefa> {
    return Object.fromEntries(this.tarefas);
  }
}
