import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { normalizarNome } from '../../../catalogo/comum/nomes';
import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  clientesAliases,
  especialidades,
  especialidadesDePara,
  exames,
  examesDeParaValores,
  medicos,
  medicosAliases,
  medicosContasMobilemed,
  modalidades,
  modalidadesDePara,
  prioridades,
  prioridadesDePara,
  quebrasEstudo,
  quebrasEstudoPecas,
  sufixosNomeCliente,
} from '../../../database/schema';
import type { LeitorCadastrosIngestao } from '../../application/ports/cadastros-ingestao';
import type { CadastrosIngestao } from '../../domain/preparar-laudo';
import {
  type CadastroClientes,
  montarClientesAmbiguosComId,
  montarResolvedorCliente,
  montarResolvedorUnidadeCliente,
} from '../../domain/resolver-cliente';
import { montarResolvedorMedico } from '../../domain/resolver-medico';
import { montarRetratoCatalogo } from '../../domain/retrato-catalogo';

/** Primeira ocorrência vence, como os resolvedores do dashboards-one. */
function indice<V>(pares: [string, V][]) {
  const mapa = new Map<string, V>();
  for (const [chave, valor] of pares) if (chave && !mapa.has(chave)) mapa.set(chave, valor);
  return mapa;
}

/** Retrato do catálogo e dos médicos para uma importação (algumas centenas de linhas). */
@Injectable()
export class DrizzleCadastrosIngestao implements LeitorCadastrosIngestao {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(): Promise<CadastrosIngestao> {
    return this.carregarComUnidades();
  }

  /**
   * O mesmo retrato, com o resolvedor que para na unidade do cliente unificado (a distribuição casa
   * arranjos e vínculos pela unidade).
   */
  async carregarComUnidades(): Promise<
    CadastrosIngestao & { resolverUnidadeCliente: (empresa: string) => string | null }
  > {
    const db = this.db;
    const [
      listaExames,
      foraDoPadrao,
      pecas,
      listaModalidades,
      variacoesModalidade,
      listaEspecialidades,
      variacoesEspecialidade,
      listaPrioridades,
      variacoesPrioridade,
      listaClientes,
      aliases,
      sufixos,
      listaMedicos,
      aliasesMedico,
      outrasContas,
    ] = await Promise.all([
      db.select().from(exames).orderBy(asc(exames.nome)),
      db.select().from(examesDeParaValores).where(eq(examesDeParaValores.ativo, true)),
      db
        .select({
          quebraId: quebrasEstudo.id,
          estudo: quebrasEstudo.estudoOrigem,
          exameId: quebrasEstudoPecas.exameId,
          categoriaExameId: exames.categoriaId,
          categoriaPecaId: quebrasEstudoPecas.categoriaId,
        })
        .from(quebrasEstudoPecas)
        .innerJoin(quebrasEstudo, eq(quebrasEstudo.id, quebrasEstudoPecas.quebraId))
        .innerJoin(exames, eq(exames.id, quebrasEstudoPecas.exameId))
        .where(eq(quebrasEstudoPecas.ativo, true))
        .orderBy(asc(quebrasEstudo.criadoEm), asc(quebrasEstudoPecas.criadoEm)),
      db.select().from(modalidades).where(eq(modalidades.ativo, true)),
      db.select().from(modalidadesDePara).where(eq(modalidadesDePara.ativo, true)),
      db.select().from(especialidades).where(eq(especialidades.ativo, true)),
      db.select().from(especialidadesDePara).where(eq(especialidadesDePara.ativo, true)),
      db.select().from(prioridades).where(eq(prioridades.ativo, true)),
      db.select().from(prioridadesDePara).where(eq(prioridadesDePara.ativo, true)),
      // Em ordem, para o retrato não depender da ordem física das linhas.
      db.select().from(clientes).orderBy(asc(clientes.nome)),
      db
        .select()
        .from(clientesAliases)
        .orderBy(asc(clientesAliases.tipo), asc(clientesAliases.chave)),
      db
        .select()
        .from(sufixosNomeCliente)
        .where(eq(sufixosNomeCliente.ativo, true))
        .orderBy(asc(sufixosNomeCliente.sufixo)),
      db
        .select({
          id: medicos.id,
          chaveNormalizada: medicos.chaveNormalizada,
          idMobilemed: medicos.idMobilemed,
        })
        .from(medicos),
      db
        .select({
          medicoId: medicosAliases.medicoId,
          chaveNormalizada: medicosAliases.chaveNormalizada,
        })
        .from(medicosAliases),
      db
        .select({
          idMobilemed: medicosContasMobilemed.idMobilemed,
          medicoId: medicosContasMobilemed.medicoId,
        })
        .from(medicosContasMobilemed),
    ]);

    const cadastroClientes: CadastroClientes = {
      clientes: listaClientes,
      aliases,
      sufixos: sufixos.map((s) => s.sufixo),
    };
    const resolverCliente = montarResolvedorCliente(cadastroClientes);
    const resolverUnidadeCliente = montarResolvedorUnidadeCliente(cadastroClientes);
    return {
      catalogo: montarRetratoCatalogo({
        exames: listaExames,
        foraDoPadrao,
        pecas,
        modalidades: listaModalidades,
        variacoesModalidade,
        especialidades: listaEspecialidades,
        variacoesEspecialidade,
      }),
      prioridades: indice([
        ...listaPrioridades.map((p): [string, string] => [normalizarNome(p.nome), p.id]),
        ...variacoesPrioridade.map((v): [string, string] => [
          normalizarNome(v.origem),
          v.prioridadeId,
        ]),
      ]),
      resolverCliente,
      clientesAmbiguos: montarClientesAmbiguosComId(cadastroClientes),
      resolverUnidade: (empresa) => {
        const unidade = resolverUnidadeCliente(empresa);
        return unidade && unidade !== resolverCliente(empresa) ? unidade : null;
      },
      resolverUnidadeCliente,
      resolverMedico: montarResolvedorMedico({
        medicos: listaMedicos,
        aliases: aliasesMedico,
        outrasContas,
      }),
    };
  }
}
