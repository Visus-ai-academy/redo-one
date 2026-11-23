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
  modalidades,
  modalidadesDePara,
  prioridades,
  prioridadesDePara,
  quebrasEstudo,
  quebrasEstudoPecas,
  sufixosNomeCliente,
} from '../../../database/schema';
import type { LeitorCadastrosIngestao } from '../../application/ports/cadastros-ingestao';
import type {
  ExameDoCadastro,
  PecaDaQuebra,
  ValorForaDoPadrao,
} from '../../domain/classificar-estudo';
import { chaveEstudo, chaveEstudoLimpo } from '../../domain/nome-estudo';
import type { CadastrosIngestao } from '../../domain/preparar-laudo';
import {
  type CadastroClientes,
  montarResolvedorCliente,
  montarResolvedorUnidadeCliente,
} from '../../domain/resolver-cliente';
import { montarResolvedorMedico } from '../../domain/resolver-medico';

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
      db.select().from(clientes),
      db.select().from(clientesAliases),
      db.select().from(sufixosNomeCliente).where(eq(sufixosNomeCliente.ativo, true)),
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
    ]);

    const exameDoCadastro = (e: (typeof listaExames)[number]): ExameDoCadastro => ({
      id: e.id,
      modalidadeId: e.modalidadeId,
      especialidadeId: e.especialidadeId,
      categoriaId: e.categoriaId,
    });
    // O vínculo do valor fora do padrão vale mesmo com o exame inativo, como no dashboards-one.
    const examePorId = new Map(listaExames.map((e) => [e.id, exameDoCadastro(e)]));

    // A regra também passa pela limpeza do estudo (decidido em 16/11/2026): no dashboards-one a
    // regra gravada com " X1 X6" nunca casava, porque só o estudo do laudo era limpo. Duas regras
    // com a mesma chave depois de limpas: vale a primeira.
    const quebras = new Map<string, PecaDaQuebra[]>();
    const donoDaChave = new Map<string, string>();
    for (const { quebraId, estudo, ...peca } of pecas) {
      const chave = chaveEstudoLimpo(estudo);
      if ((donoDaChave.get(chave) ?? quebraId) !== quebraId) continue;
      donoDaChave.set(chave, quebraId);
      quebras.set(chave, [...(quebras.get(chave) ?? []), peca]);
    }

    const cadastroClientes: CadastroClientes = {
      clientes: listaClientes,
      aliases,
      sufixos: sufixos.map((s) => s.sufixo),
    };
    return {
      catalogo: {
        exames: indice(
          listaExames.filter((e) => e.ativo).map((e) => [chaveEstudo(e.nome), exameDoCadastro(e)]),
        ),
        valoresForaDoPadrao: indice<ValorForaDoPadrao>(
          foraDoPadrao
            .filter((f) => f.valores > 0)
            .map((f) => [
              chaveEstudo(f.estudoDescricao),
              { valores: f.valores, exame: f.exameId ? (examePorId.get(f.exameId) ?? null) : null },
            ]),
        ),
        quebras,
        modalidades: indice([
          ...listaModalidades.map((m): [string, string] => [normalizarNome(m.codigo), m.id]),
          ...variacoesModalidade.map((v): [string, string] => [
            normalizarNome(v.origem),
            v.modalidadeId,
          ]),
        ]),
        especialidades: indice([
          ...listaEspecialidades.map((e): [string, string] => [normalizarNome(e.nome), e.id]),
          ...variacoesEspecialidade.flatMap((v): [string, string][] =>
            v.especialidadeId ? [[normalizarNome(v.origem), v.especialidadeId]] : [],
          ),
        ]),
        especialidadesInvalidas: new Set(
          variacoesEspecialidade
            .filter((v) => v.tipo === 'invalida')
            .map((v) => normalizarNome(v.origem)),
        ),
      },
      prioridades: indice([
        ...listaPrioridades.map((p): [string, string] => [normalizarNome(p.nome), p.id]),
        ...variacoesPrioridade.map((v): [string, string] => [
          normalizarNome(v.origem),
          v.prioridadeId,
        ]),
      ]),
      resolverCliente: montarResolvedorCliente(cadastroClientes),
      resolverUnidadeCliente: montarResolvedorUnidadeCliente(cadastroClientes),
      resolverMedico: montarResolvedorMedico({ medicos: listaMedicos, aliases: aliasesMedico }),
    };
  }
}
