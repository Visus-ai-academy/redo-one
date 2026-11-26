import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import type { DadosRepasse } from '../../application/ports/dados-repasse';
import type { RegraApuracaoVigente, TipoRegraApuracao } from '../../domain/apuracao';
import type { AlternativaPreco, PrecoRepasse } from '../../domain/busca-preco';
import type {
  AplicacaoRetencao,
  ConfiguracaoMedicoVigente,
  EntradaRepasse,
  LaudoRepasse,
  PessoaMedico,
  ReclassificacaoVigente,
} from '../../domain/demonstrativo';

/** Vigente na competência `$c` (colunas `vigencia_desde`/`vigencia_ate` da tabela `t`). */
const vigente = (t: string, c: string) =>
  sql.raw(
    `(${t}.vigencia_desde is null or ${t}.vigencia_desde <= '${c}') and (${t}.vigencia_ate is null or ${t}.vigencia_ate >= '${c}')`,
  );

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Lista de ids do recorte, ou `null` quando a coluna "todos" está marcada. */
const ouTodos = (todos: boolean, ids: (string | null)[] | null) =>
  todos ? null : (ids ?? []).filter((x): x is string => x !== null);

/**
 * Lê, para uma competência, os laudos (da `ingestao`, com as peças da quebra), as equipes e os
 * arranjos dos médicos (do `medicos` e da `distribuicao`) e a configuração do repasse vigente nela.
 * Só leitura; nada de paciente.
 */
@Injectable()
export class DrizzleDadosRepasse implements DadosRepasse {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async linhas<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    return (await this.db.execute(q)).rows as T[];
  }

  async carregar(competencia: string): Promise<EntradaRepasse> {
    if (!COMPETENCIA.test(competencia)) throw new Error(`Competência inválida: ${competencia}`);
    const c = competencia;

    // Laudo assinado, não removido, fora da exclusão fiscal. A peça da quebra vale 1, com o exame
    // (e a categoria) dela; a modalidade é a do laudo.
    const laudos = await this.linhas<{
      laudo_id: string;
      peca: number;
      medico_id: string | null;
      cliente_id: string | null;
      unidade_id: string | null;
      modalidade_id: string | null;
      especialidade_id: string | null;
      categoria_id: string | null;
      prioridade_id: string | null;
      volume: number;
      dia: string;
      duplicado: boolean;
    }>(sql`
      select l.id laudo_id, coalesce(p.ordem, 0) peca, l.medico_id, l.cliente_id, l.unidade_id,
        l.modalidade_id,
        case when p.laudo_id is null then l.especialidade_id
          else coalesce(e.especialidade_id, l.especialidade_id) end especialidade_id,
        case when p.laudo_id is null then l.categoria_id
          else coalesce(p.categoria_id, e.categoria_id) end categoria_id,
        l.prioridade_id,
        case when p.laudo_id is null then l.volume::float8 else 1 end volume,
        to_char(l.dia_laudo, 'YYYY-MM-DD') dia, l.duplicado
      from laudos l
      left join clientes_dados_fiscais f on f.cliente_id = coalesce(l.unidade_id, l.cliente_id)
      left join laudos_pecas_quebra p on p.laudo_id = l.id
      left join exames e on e.id = p.exame_id
      where l.competencia = ${c} and l.removido_em is null and l.status <> 'Não Assinado'
        and not coalesce(f.exclusao_fiscal, false)
    `);

    const [parametros] = await this.linhas<{
      contratado_registro_id: string | null;
      paga_duplicados: boolean;
    }>(sql`
      select contratado_registro_id, paga_duplicados from parametros_repasse
      where vigencia_desde <= ${c} order by vigencia_desde desc limit 1
    `);

    const equipes = await this.linhas<{ medico_id: string; equipe_id: string }>(
      sql`select medico_id, equipe_id from equipes_membros`,
    );
    const equipesDoMedico = new Map<string, Set<string>>();
    for (const e of equipes)
      equipesDoMedico.set(
        e.medico_id,
        (equipesDoMedico.get(e.medico_id) ?? new Set()).add(e.equipe_id),
      );

    // O que o médico lauda: as especialidades dos arranjos dele (e das equipes dele).
    const arranjos = await this.linhas<{ medico_id: string; especialidade_id: string }>(sql`
      select distinct coalesce(a.medico_id, m.medico_id) medico_id, a.especialidade_id
      from arranjos a left join equipes_membros m on m.equipe_id = a.equipe_id
      where a.especialidade_id is not null and coalesce(a.medico_id, m.medico_id) is not null
    `);
    const especialidadesDoMedico = new Map<string, Set<string>>();
    for (const a of arranjos)
      especialidadesDoMedico.set(
        a.medico_id,
        (especialidadesDoMedico.get(a.medico_id) ?? new Set()).add(a.especialidade_id),
      );

    const reclass = await this.linhas<{
      id: string;
      todas_modalidades: boolean;
      todas_especialidades: boolean;
      todas_categorias: boolean;
      todos_medicos: boolean;
      especialidade_destino_id: string | null;
      categoria_destino_id: string | null;
      modalidades: (string | null)[];
      especialidades: (string | null)[];
      categorias: (string | null)[];
      equipes: (string | null)[];
    }>(sql`
      select r.id, r.todas_modalidades, r.todas_especialidades, r.todas_categorias, r.todos_medicos,
        r.especialidade_destino_id, r.categoria_destino_id,
        array_agg(x.modalidade_id) modalidades, array_agg(x.especialidade_id) especialidades,
        array_agg(x.categoria_id) categorias, array_agg(x.equipe_id) equipes
      from reclassificacoes_repasse r
      left join reclassificacoes_repasse_recortes x on x.reclassificacao_id = r.id
      where ${vigente('r', c)}
      group by r.id order by r.ordem, r.criado_em
    `);
    const reclassificacoes: ReclassificacaoVigente[] = reclass.map((r) => ({
      id: r.id,
      modalidadeIds: ouTodos(r.todas_modalidades, r.modalidades),
      especialidadeIds: ouTodos(r.todas_especialidades, r.especialidades),
      categoriaIds: ouTodos(r.todas_categorias, r.categorias),
      equipeIds: ouTodos(r.todos_medicos, r.equipes),
      especialidadeDestinoId: r.especialidade_destino_id,
      categoriaDestinoId: r.categoria_destino_id,
    }));

    const configs = await this.linhas<{
      medico_id: string;
      somente_adicionais: boolean;
      todos_os_laudos: boolean;
      clientes: (string | null)[];
      especialidades: (string | null)[];
      com_recorte: boolean[];
    }>(sql`
      select c.medico_id, c.somente_adicionais, c.todos_os_laudos,
        array_agg(x.cliente_id) clientes, array_agg(x.especialidade_id) especialidades,
        array_agg(x.id is not null) com_recorte
      from configuracoes_medico_repasse c
      left join configuracoes_medico_repasse_recortes x on x.configuracao_id = c.id
      where ${vigente('c', c)}
      group by c.id, c.medico_id, c.somente_adicionais, c.todos_os_laudos, c.vigencia_desde
      order by c.vigencia_desde nulls first
    `);
    const configuracoes = new Map<string, ConfiguracaoMedicoVigente>();
    for (const cf of configs)
      configuracoes.set(cf.medico_id, {
        somenteAdicionais: cf.somente_adicionais,
        recortes: cf.todos_os_laudos
          ? null
          : cf.com_recorte.flatMap((tem, i) =>
              tem
                ? [
                    {
                      clienteId: cf.clientes[i] ?? null,
                      especialidadeId: cf.especialidades[i] ?? null,
                    },
                  ]
                : [],
            ),
      });

    const precosLinhas = await this.linhas<{
      id: string;
      medico_id: string;
      modalidade_id: string;
      especialidade_id: string;
      categoria_id: string;
      prioridade_id: string;
      cliente_id: string | null;
      valor_centavos: number;
    }>(sql`
      select p.id, p.medico_id, p.modalidade_id, p.especialidade_id, p.categoria_id, p.prioridade_id,
        p.cliente_id, p.valor_centavos
      from precos_repasse p where ${vigente('p', c)}
      order by p.vigencia_desde desc nulls last, p.criado_em desc
    `);
    const precos = new Map<string, PrecoRepasse[]>();
    for (const p of precosLinhas)
      precos.set(p.medico_id, [
        ...(precos.get(p.medico_id) ?? []),
        {
          id: p.id,
          modalidadeId: p.modalidade_id,
          especialidadeId: p.especialidade_id,
          categoriaId: p.categoria_id,
          prioridadeId: p.prioridade_id,
          clienteId: p.cliente_id,
          valorCentavos: p.valor_centavos,
        },
      ]);

    const alternativas = (
      await this.linhas<{
        especialidade_id: string | null;
        sem_categoria: boolean;
        categoria_origem_id: string | null;
        categoria_destino_id: string;
      }>(sql`
        select especialidade_id, sem_categoria, categoria_origem_id, categoria_destino_id
        from alternativas_preco_repasse a where ${vigente('a', c)} order by ordem, criado_em
      `)
    ).map(
      (a): AlternativaPreco => ({
        especialidadeId: a.especialidade_id,
        semCategoria: a.sem_categoria,
        categoriaOrigemId: a.categoria_origem_id,
        categoriaDestinoId: a.categoria_destino_id,
      }),
    );

    const regras = (
      await this.linhas<{
        id: string;
        medico_id: string;
        tipo: TipoRegraApuracao;
        descricao: string;
        valor_centavos: number | null;
        percentual_ppm: number | null;
        divisor: number;
        todas_modalidades: boolean;
        todas_especialidades: boolean;
        todas_prioridades: boolean;
        modalidades: (string | null)[];
        especialidades: (string | null)[];
        prioridades: (string | null)[];
      }>(sql`
        select r.id, r.medico_id, r.tipo, r.descricao, r.valor_centavos, r.percentual_ppm, r.divisor,
          r.todas_modalidades, r.todas_especialidades, r.todas_prioridades,
          array_agg(x.modalidade_id) modalidades, array_agg(x.especialidade_id) especialidades,
          array_agg(x.prioridade_id) prioridades
        from regras_apuracao_repasse r
        left join regras_apuracao_repasse_recortes x on x.regra_id = r.id
        where ${vigente('r', c)}
        group by r.id order by r.criado_em, r.id
      `)
    ).map(
      (r): RegraApuracaoVigente => ({
        id: r.id,
        medicoId: r.medico_id,
        tipo: r.tipo,
        descricao: r.descricao,
        valorCentavos: r.valor_centavos,
        percentualPpm: r.percentual_ppm,
        divisor: r.divisor,
        modalidadeIds: ouTodos(r.todas_modalidades, r.modalidades),
        especialidadeIds: ouTodos(r.todas_especialidades, r.especialidades),
        prioridadeIds: ouTodos(r.todas_prioridades, r.prioridades),
      }),
    );

    const adicionais = (
      await this.linhas<{
        id: string;
        medico_id: string;
        valor_centavos: number;
        descricao: string;
        data: string;
      }>(sql`
        select id, medico_id, valor_centavos, descricao, to_char(data, 'YYYY-MM-DD') data
        from adicionais_repasse where competencia = ${c} and cancelado_em is null
        order by data, lancado_em
      `)
    ).map((a) => ({
      id: a.id,
      medicoId: a.medico_id,
      valorCentavos: a.valor_centavos,
      descricao: a.descricao,
      data: a.data,
    }));

    const retencoes = (
      await this.linhas<{
        id: string;
        descricao: string;
        aplica_a: AplicacaoRetencao;
        aliquota_ppm: number;
        piso_centavos: number;
      }>(sql`
        select id, descricao, aplica_a, aliquota_ppm, piso_centavos
        from retencoes_repasse r where ${vigente('r', c)} order by criado_em
      `)
    ).map((r) => ({
      id: r.id,
      descricao: r.descricao,
      aplicaA: r.aplica_a,
      aliquotaPpm: r.aliquota_ppm,
      pisoCentavos: r.piso_centavos,
    }));

    // Tipo de pessoa só quando há retenção: é dado de pagamento (LGPD), lido só no que a regra usa.
    const pessoas = new Map<string, PessoaMedico>();
    if (retencoes.length)
      for (const p of await this.linhas<{
        medico_id: string;
        pj: boolean;
        pf: boolean;
        optante_simples: boolean | null;
      }>(sql`
        select medico_id, cnpj is not null pj, cpf is not null pf, optante_simples
        from medicos_dados_pagamento
      `))
        pessoas.set(p.medico_id, {
          tipo: p.pj ? 'pessoa_juridica' : p.pf ? 'pessoa_fisica' : 'desconhecido',
          optanteSimples: p.optante_simples,
        });

    return {
      laudos: laudos.map(
        (l): LaudoRepasse => ({
          laudoId: l.laudo_id,
          peca: l.peca,
          medicoId: l.medico_id,
          clienteId: l.cliente_id,
          unidadeId: l.unidade_id,
          modalidadeId: l.modalidade_id,
          especialidadeId: l.especialidade_id,
          categoriaId: l.categoria_id,
          prioridadeId: l.prioridade_id,
          volume: Number(l.volume),
          dia: l.dia,
          duplicado: l.duplicado,
        }),
      ),
      pagaDuplicados: parametros?.paga_duplicados ?? true,
      contratadoId: parametros?.contratado_registro_id ?? null,
      equipesDoMedico,
      reclassificacoes,
      configuracoes,
      precos,
      alternativas,
      regras,
      especialidadesDoMedico,
      adicionais,
      retencoes,
      pessoas,
    };
  }
}
