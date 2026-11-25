import { Client } from 'pg';

import type {
  LegadoCatalogo,
  LegadoCompetencia,
  LegadoConfiguracaoDistribuicao,
  LegadoDadosFiscais,
  LegadoDistribuicao,
  LegadoEscala,
  LegadoMedicos,
  LegadoPrecos,
  LegadoTipificacao,
} from './legado';

/**
 * Lê o banco do dashboards-one (em produção) SÓ PARA LEITURA: uma conexão, uma transação
 * `READ ONLY` (o Postgres recusa qualquer escrita) e tempo limite por consulta. As tabelas são
 * pequenas (cadastros), então cada uma vem numa consulta só. A ordem física (`ctid`) é a mesma em
 * que o Prisma de lá as lê, e é ela que decide os empates no resolvedor de clientes.
 */
export async function lerLegado(url: string): Promise<{
  catalogo: LegadoCatalogo;
  medicos: LegadoMedicos;
  escala: LegadoEscala;
  distribuicao: LegadoDistribuicao;
  configuracaoDistribuicao: LegadoConfiguracaoDistribuicao;
  competencias: LegadoCompetencia[];
  dadosFiscais: LegadoDadosFiscais;
  tipificacao: LegadoTipificacao;
  precos: LegadoPrecos;
}> {
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
      especialidades: await ler(
        'select id, nome, null as descricao, cor, ordem, ativo, modalidade from especialidades order by ctid',
      ),
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
          cpf, cnpj, "nomeEmpresa", "tipoChavePix", "chavePix", socio, "optanteSimples"
          from medicos order by ctid`,
      ),
      aliases: await ler(
        'select id, "medicoId", "nomeOrigem", "tipoOrigem", "verificadoManualmente", observacoes from medico_nome_aliases order by ctid',
      ),
      equipes: await ler(
        'select id, nome, descricao, cor, ordem, ativo, plantao from equipes order by ctid',
      ),
      equipesMembros: await ler('select "equipeId", "medicoId" from equipes_membros'),
    };
    // Datas puras como texto e instantes como ISO em UTC: o `timestamp` sem fuso do Prisma é UTC,
    // e o `pg` o leria no fuso da máquina.
    const instante = (coluna: string) =>
      `to_char("${coluna}" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "${coluna}"`;
    const dia = (coluna: string) => `to_char("${coluna}", 'YYYY-MM-DD') as "${coluna}"`;
    const escala: LegadoEscala = {
      turnos: await ler(
        'select id, nome, tipo, "horarioInicio", "horarioFim", cor, ordem, ativo from turnos order by ctid',
      ),
      turnosEspecialidades: await ler(
        'select "turnoId", "especialidadeId", ativo from turno_especialidades order by "turnoId", ordem',
      ),
      alocacoes: await ler(
        `select id, "turnoId", "especialidadeId", "medicoId", "diasSemana", "semanasDoMes",
          "horarioInicio", "horarioFim", ${dia('dataInicio')}, ${dia('dataFim')}, status,
          produtividade, prioridades, subespecialidades, gratificado, observacoes, "coberturaDeId",
          ${instante('criadoEm')} from alocacoes_medico order by ctid`,
      ),
      ajustes: await ler(
        `select id, "alocacaoId", ${dia('data')}, produtividade, observacoes
          from ajustes_produtividade order by ctid`,
      ),
      ausencias: await ler(
        `select id, "medicoId", tipo, ${dia('dataInicio')}, ${dia('dataFim')}, observacoes,
          "especialidadeIds", "diasSemana", "turnoIds", situacao, origem, "solicitadaPorUserId",
          "revisadaPorUserId", ${instante('revisadaEm')}, "motivoRecusa", ${instante('criadoEm')}
          from ausencias_medico order by ctid`,
      ),
      logs: await ler(
        `select id, entidade, "registroId", acao, "usuarioId", "usuarioNome", "medicoId", antes,
          depois, ${instante('criadoEm')} from logs_alteracao_escala order by "criadoEm", id`,
      ),
      // Só quem a escala cita, e só o que a carga usa (LGPD: sem senha, papel, foto...).
      usuarios: await ler(
        `select id, name as nome, email, "escopoTurnoIds", "escopoEspecialidadeIds" from users
          where cardinality("escopoTurnoIds") > 0 or cardinality("escopoEspecialidadeIds") > 0
            or id in (select "usuarioId" from logs_alteracao_escala where "usuarioId" is not null)
            or id in (select "solicitadaPorUserId" from ausencias_medico where "solicitadaPorUserId" is not null)
            or id in (select "revisadaPorUserId" from ausencias_medico where "revisadaPorUserId" is not null)
          order by ctid`,
      ),
    };
    const eixosArranjo = `id, "especialidadeId", modalidades, subespecialidades, prioridades,
      "modoClientes", clientes, "modoExames", exames, ordem, ativo`;
    const distribuicao: LegadoDistribuicao = {
      arranjosMedico: await ler(
        `select ${eixosArranjo}, "medicoId", "clientesExclusivos" from medico_regras_distribuicao
          order by "medicoId", ordem, "criadoEm"`,
      ),
      arranjosEquipe: await ler(
        `select ${eixosArranjo}, "equipeId" from equipe_regras_distribuicao
          order by "equipeId", ordem, "criadoEm"`,
      ),
      habilitados: (
        await ler<{ id: string }>('select id from medicos where "distribuicaoAutomatica"')
      ).map((m) => m.id),
    };
    const [configRobo] = await ler<LegadoConfiguracaoDistribuicao['config'] & object>(
      `select "ordemFila", "prioridadesUrgentes", "agruparPorPaciente", "janelaPacienteHoras",
        "escalaRestringeEspecialidade", "toleranciaAcimaCapacidade", "reservaUrgenciaPct",
        "folgaAtrasadoPct", "cicloMinutos", "marcadoresEquilibrio", "listaPrioridades",
        "listaPrazoMinimoHoras", "roboRecolherAposTurnoMin", "roboListaDepoisDosFixos",
        "roboAtivo", "roboExpiracaoMin", "roboTetoPorRodada"
        from configuracao_distribuicao order by ctid limit 1`,
    );
    const configuracaoDistribuicao: LegadoConfiguracaoDistribuicao = {
      config: configRobo ?? null,
      politicas: await ler(
        `select id, escopo, especialidade, modalidade, ativo, automatico, "metodoDivisao",
          proporcoes, "loteTamanho", "cotaValor", "cotaJanela", pesos, "tetosSubespecialidade"
          from politicas_distribuicao order by ordem, ctid`,
      ),
      janelas: await ler(
        `select id, nome, "diasSemana", "horaInicio", "horaFim", modalidade, especialidade, ativo
          from janelas_sem_automacao order by ctid`,
      ),
      prioridadesCliente: await ler(
        'select "clienteId", "especialidadeId", nivel from prioridades_cliente order by ctid',
      ),
    };
    const competencias = await ler<LegadoCompetencia>(
      `select competencia, status, ${instante('dataFechamento')}, "fechadoPor", observacoes,
        ${instante('reabertoEm')}, "reabertoPor", ${instante('importacaoTravadaEm')},
        "importacaoTravadaPor" from fechamentos_periodo order by competencia`,
    );
    const [exclusao] = await ler<{ faturamentoExclusaoFiscal: string[] | null }>(
      // A linha única, como o dashboards-one a lê (`configuracao.findUnique({ id: 'default' })`).
      `select "faturamentoExclusaoFiscal" from configuracoes where id = 'default'`,
    );
    const dadosFiscais: LegadoDadosFiscais = {
      clientes: await ler(
        `select id, contato, email, "emailEnvioNf", telefone, "bancoCodigo", "bancoAgencia",
          "bancoConta", endereco, "enderecoNumero", complemento, bairro, cidade, estado, cep
          from clientes order by ctid`,
      ),
      exclusaoFiscal: exclusao?.faturamentoExclusaoFiscal ?? [],
    };
    const tipificacao: LegadoTipificacao = {
      regras: await ler(
        'select id, nome, descricao, cor, ordem, ativo from regras_categorias order by ctid',
      ),
      subRegras: await ler(
        'select id, "regraId", nome, descricao, ordem, ativo, fatura from sub_regras order by ctid',
      ),
      clienteRegras: await ler(
        'select empresa, "regraId", principal from cliente_regras order by ctid',
      ),
      clienteSubRegras: await ler(
        `select empresa, "subRegraId", "catchAll", "modalidadeMedicos", "especialidadeMedicos",
          prioridades from cliente_sub_regras order by ctid`,
      ),
      ordens: await ler(
        'select empresa, personalizada, linhas from clientes_regras_ordem order by ctid',
      ),
      grupos: await ler('select id, nome, ativo from grupos_medicos order by ctid'),
    };
    const colunasPreco = `id, modalidade, especialidade, categoria, prioridade,
      "valorBase"::float8 as "valorBase", "condVolume", "volumeInicial", "volumeFinal",
      ${instante('atualizadoEm')}`;
    const precos: LegadoPrecos = {
      clientes: await ler(
        `select ${colunasPreco}, "clienteId" as "donoId", "clienteNome" as "donoNome",
          "vigenciaDesde", "vigenciaAte"
          from precos_servicos where ativo order by ctid`,
      ),
      padrao: await ler(
        `select ${colunasPreco}, "contratadoId" as "donoId", null as "donoNome",
          null as "vigenciaDesde", null as "vigenciaAte"
          from tabela_precos_padrao where ativo order by ctid`,
      ),
    };
    await cliente.query('COMMIT');
    return {
      precos,
      tipificacao,
      catalogo,
      medicos,
      escala,
      distribuicao,
      configuracaoDistribuicao,
      competencias,
      dadosFiscais,
    };
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}
