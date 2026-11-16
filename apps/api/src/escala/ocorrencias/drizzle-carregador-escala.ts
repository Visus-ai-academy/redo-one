import { Inject, Injectable } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { CATALOGO_DA_FRENTE_F, ROTULO_DA_FRENTE_F } from '../frentes/frente-do-catalogo';
import type { CarregadorEscala, DadosEscala } from './carregador-escala';

/** Ids de uma tabela de recorte (`r`) como array de texto, em ordem. */
const idsDoRecorte = (tabela: string, coluna: string, chave: string, dono: string) =>
  sql.raw(
    `array(select r.${coluna}::text from ${tabela} r where r.${chave} = ${dono}.id order by 1)`,
  );

/** Uma lista JSON (`[]` quando vazia, nunca `null`). */
const lista = (objeto: SQL, de: SQL) =>
  sql`coalesce((select json_agg(${objeto}) ${de}), '[]'::json)`;

/**
 * Carrega a escala de uma janela numa consulta só: no banco remoto cada ida custa a latência da
 * rede (~140 ms no dev), muito mais que as consultas em si (poucos ms). Traz as alocações que tocam
 * a janela (índice de vigência) e os titulares das coberturas que ficaram de fora, os cadastros, os
 * médicos dessas alocações, as ausências aprovadas e os ajustes dos dias. Os tipos que voltam no
 * JSON (texto, inteiro, array de inteiros, `date` como "YYYY-MM-DD", booleano) são os mesmos que o
 * Drizzle devolveria.
 */
@Injectable()
export class DrizzleCarregadorEscala implements CarregadorEscala {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(de: string, ate: string): Promise<DadosEscala> {
    const alocacao = sql`json_build_object(
      'id', a.id, 'medicoId', a.medico_id, 'turnoId', a.turno_id, 'frenteId', a.frente_id,
      'diasSemana', a.dias_semana, 'semanasDoMes', a.semanas_do_mes,
      'horarioInicio', a.horario_inicio, 'horarioFim', a.horario_fim,
      'dataInicio', a.data_inicio, 'dataFim', a.data_fim, 'produtividade', a.produtividade,
      'gratificado', a.gratificado, 'subespecialidadeGeral', a.subespecialidade_geral,
      'coberturaDeId', a.cobertura_de_id,
      'prioridadeIds', ${idsDoRecorte('alocacoes_prioridades', 'prioridade_id', 'alocacao_id', 'a')},
      'subespecialidadeIds', ${idsDoRecorte('alocacoes_subespecialidades', 'subespecialidade_id', 'alocacao_id', 'a')}
    )`;
    const ausencia = sql`json_build_object(
      'id', au.id, 'medicoId', au.medico_id, 'tipoId', au.tipo_id,
      'dataInicio', au.data_inicio, 'dataFim', au.data_fim, 'diasSemana', au.dias_semana,
      'situacao', au.situacao,
      'frenteIds', ${idsDoRecorte('ausencias_frentes', 'frente_id', 'ausencia_id', 'au')},
      'turnoIds', ${idsDoRecorte('ausencias_turnos', 'turno_id', 'ausencia_id', 'au')}
    )`;

    const resultado = await this.db.execute<{ dados: DadosEscala }>(sql`
      with da_janela as (
        select * from alocacoes
        where data_inicio <= ${ate}::date and (data_fim is null or data_fim >= ${de}::date)
      ),
      todas as (
        select * from da_janela
        union all
        -- Titulares das coberturas da janela que não tocam a janela.
        select * from alocacoes
        where id in (select cobertura_de_id from da_janela)
          and id not in (select id from da_janela)
      )
      select json_build_object(
        'alocacoes', ${lista(alocacao, sql`from todas a`)},
        'turnos', ${lista(
          sql`json_build_object('id', t.id, 'nome', t.nome, 'tipo', t.tipo,
            'horarioInicio', t.horario_inicio, 'horarioFim', t.horario_fim, 'ativo', t.ativo,
            'cor', t.cor, 'ordem', t.ordem)`,
          sql`from turnos t`,
        )},
        -- Nome, ativo, cor e ordem do catálogo: especialidade ou modalidade inativa = frente inativa.
        'frentes', ${lista(
          sql`json_build_object('id', f.id, 'rotulo', ${ROTULO_DA_FRENTE_F},
            'ativo', coalesce(fe.ativo, fm.ativo), 'cor', coalesce(fe.cor, fm.cor),
            'ordem', coalesce(fe.ordem, fm.ordem))`,
          sql`from frentes_escala f ${CATALOGO_DA_FRENTE_F}`,
        )},
        'medicos', ${lista(
          sql`json_build_object('id', m.id, 'nome', m.nome, 'ativo', m.ativo)`,
          sql`from medicos m where m.id in (select medico_id from todas)`,
        )},
        'ausencias', ${lista(
          ausencia,
          sql`from ausencias au
            where au.situacao = 'aprovada' and au.data_inicio <= ${ate}::date
              and au.data_fim >= ${de}::date`,
        )},
        'tiposAusencia', ${lista(
          sql`json_build_object('id', ta.id, 'nome', ta.nome, 'gravidade', ta.gravidade,
            'cor', ta.cor)`,
          sql`from tipos_ausencia ta`,
        )},
        'ajustes', ${lista(
          sql`json_build_object('alocacaoId', aj.alocacao_id, 'data', aj.data,
            'produtividade', aj.produtividade)`,
          sql`from ajustes_produtividade aj where aj.data between ${de}::date and ${ate}::date`,
        )}
      ) as dados
    `);
    const dados = resultado.rows[0]?.dados;
    if (!dados) throw new Error('A consulta da escala não devolveu linha.');
    return dados;
  }
}
