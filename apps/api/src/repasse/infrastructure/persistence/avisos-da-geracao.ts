import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, like } from 'drizzle-orm';

import { REGISTRO_AVISOS, type RegistroAvisos } from '../../../comum/avisos/registro-avisos';
import {
  avisosCadastro,
  categoriasExame,
  clientes,
  especialidades,
  medicos,
  modalidades,
  prioridades,
} from '../../../database/schema';
import type { NovaGeracao } from '../../application/ports/geracoes-repasse';
import { avisosSemPreco } from '../../domain/avisos';
import type { Tx } from './drizzle-geracoes-repasse';

/**
 * Depois de gravar a geração, na mesma transação: abre (ou atualiza) um aviso por médico e arranjo
 * com laudos sem preço e resolve os da mesma competência cuja causa sumiu. O tipo impede fechar a
 * competência (configurável em Configurações › Avisos).
 */
@Injectable()
export class AvisosDaGeracao {
  constructor(@Inject(REGISTRO_AVISOS) private readonly registro: RegistroAvisos) {}

  async registrar(tx: Tx, g: NovaGeracao): Promise<void> {
    const ids = new Set<string>();
    for (const d of g.demonstrativos)
      for (const gr of d.grupos)
        if (gr.origem === 'sem_preco') {
          ids.add(d.medicoId);
          for (const id of [
            gr.modalidadeId,
            gr.especialidadeId,
            gr.categoriaId,
            gr.prioridadeId,
            gr.clienteId,
            gr.unidadeId,
          ])
            if (id) ids.add(id);
        }
    const nomes = new Map<string, string>();
    if (ids.size) {
      const lista = [...ids];
      for (const linhas of [
        await tx
          .select({ id: medicos.id, nome: medicos.nome })
          .from(medicos)
          .where(inArray(medicos.id, lista)),
        await tx
          .select({ id: modalidades.id, nome: modalidades.codigo })
          .from(modalidades)
          .where(inArray(modalidades.id, lista)),
        await tx
          .select({ id: especialidades.id, nome: especialidades.nome })
          .from(especialidades)
          .where(inArray(especialidades.id, lista)),
        await tx
          .select({ id: categoriasExame.id, nome: categoriasExame.nome })
          .from(categoriasExame)
          .where(inArray(categoriasExame.id, lista)),
        await tx
          .select({ id: prioridades.id, nome: prioridades.nome })
          .from(prioridades)
          .where(inArray(prioridades.id, lista)),
        await tx
          .select({ id: clientes.id, nome: clientes.nome })
          .from(clientes)
          .where(inArray(clientes.id, lista)),
      ])
        for (const l of linhas) nomes.set(l.id, l.nome);
    }
    const levantados = avisosSemPreco(g.competencia, g.demonstrativos, (id) => nomes.get(id) ?? id);
    const daCompetencia = await tx
      .select({ chave: avisosCadastro.chave })
      .from(avisosCadastro)
      .where(
        and(
          eq(avisosCadastro.tipo, 'repasse_sem_preco'),
          eq(avisosCadastro.status, 'pendente'),
          like(avisosCadastro.chave, `${g.competencia}|%`),
        ),
      );
    await this.registro.registrar(tx, {
      origem: 'job',
      levantados,
      conferidos: daCompetencia.map((a) => ({
        tipo: 'repasse_sem_preco' as const,
        chave: a.chave,
      })),
      agora: g.geradoEm,
    });
  }
}
