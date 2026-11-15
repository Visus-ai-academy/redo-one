import { Client } from 'pg';

import type { LegadoCatalogo, LegadoMedicos } from './legado';

/**
 * Lê o banco do dashboards-one (em produção) SÓ PARA LEITURA: uma conexão, uma transação
 * `READ ONLY` (o Postgres recusa qualquer escrita) e tempo limite por consulta. As tabelas são
 * pequenas (cadastros), então cada uma vem numa consulta só. A ordem física (`ctid`) é a mesma em
 * que o Prisma de lá as lê, e é ela que decide os empates no resolvedor de clientes.
 */
export async function lerLegado(
  url: string,
): Promise<{ catalogo: LegadoCatalogo; medicos: LegadoMedicos }> {
  const cliente = new Client({
    connectionString: url,
    application_name: 'redo-one-migracao-leitura',
  });
  await cliente.connect();
  try {
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    await cliente.query("SET LOCAL statement_timeout = '30s'");
    const ler = async <T>(sql: string): Promise<T[]> => (await cliente.query(sql)).rows as T[];
    const lista = (tabela: string, descricao = true) =>
      ler<LegadoCatalogo['modalidades'][number]>(
        `select id, nome, ${descricao ? 'descricao' : 'null as descricao'}, cor, ordem, ativo from ${tabela} order by ctid`,
      );

    const [config] = await ler<{ prioridadesUrgentes: string[] }>(
      'select "prioridadesUrgentes" from configuracao_distribuicao order by ctid limit 1',
    );
    const catalogo: LegadoCatalogo = {
      modalidades: await lista('modalidades'),
      especialidades: await lista('especialidades', false),
      subespecialidades: await lista('subespecialidades', false),
      subespecialidadesEspecialidades: await ler(
        'select "A" as "especialidadeId", "B" as "subespecialidadeId" from "_EspecialidadeToSubespecialidade"',
      ),
      categorias: await lista('categorias_exame'),
      prioridades: await lista('prioridades'),
      prioridadesUrgentes: config?.prioridadesUrgentes ?? [],
      prioridadesDePara: await ler(
        'select id, "prioridadeOriginal", "nomeFinal", ativo from prioridade_de_para order by ctid',
      ),
      especialidadeRegras: await ler(
        'select id, tipo, origem, destino, ativo, observacoes from especialidade_regra order by ctid',
      ),
      exames: await ler(
        `select id, nome, "codigoExame", descricao, modalidade, especialidade, subespecialidade,
          categoria, prioridade, "permiteQuebra", "exigeRevisaoManual", ativo from exames order by ctid`,
      ),
      regrasQuebra: await ler(
        'select id, "exameOriginal", "exameQuebrado", "categoriaQuebrada", ativo from regras_quebra_exames order by ctid',
      ),
      examesForaPadrao: await ler(
        'select id, "estudoDescricao", valores::float8 as valores, "exameId", ativo from exames_fora_padrao order by ctid',
      ),
      contratados: await ler(
        'select id, "razaoSocial", cnpj, endereco, cidade, uf, cep, "contratadoRepasseId", ativo from contratado order by ctid',
      ),
      clientes: await ler(
        `select id, nome, "nomeFantasia", "razaoSocial", cnpj, cpf, "tipoPessoa", "contratadoId",
          ativo, observacoes from clientes order by ctid`,
      ),
      clientesOcultos: (await ler<{ empresa: string }>('select empresa from clientes_ocultos')).map(
        (o) => o.empresa,
      ),
      clienteNomeAliases: await ler(
        'select id, "clienteId", "nomeOrigem", "verificadoManualmente", observacoes from cliente_nome_aliases order by ctid',
      ),
      clienteApelidos: await ler(
        'select id, padrao, tipo, destino, ativo, observacoes from cliente_apelidos order by ctid',
      ),
    };
    const medicos: LegadoMedicos = {
      medicos: await ler(
        `select id, nome, crm, "idMobilemed", email, telefone, ativo, senior, fellowship, funcao,
          nivel, to_char("dataInicioVinculo", 'YYYY-MM-DD') as "dataInicioVinculo", observacoes,
          cpf, cnpj, "nomeEmpresa", "tipoChavePix", "chavePix", socio, "optanteSimples",
          "omieCodigoFornecedor" from medicos order by ctid`,
      ),
      aliases: await ler(
        'select id, "medicoId", "nomeOrigem", "tipoOrigem", "verificadoManualmente", observacoes from medico_nome_aliases order by ctid',
      ),
      equipes: await ler(
        'select id, nome, descricao, cor, ordem, ativo, plantao from equipes order by ctid',
      ),
      equipesMembros: await ler('select "equipeId", "medicoId" from equipes_membros'),
    };
    await cliente.query('COMMIT');
    return { catalogo, medicos };
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}
