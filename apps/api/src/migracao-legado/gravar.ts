import {
  and,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  isNull,
  notExists,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { normalizarGrafia } from '../distribuicao/domain/motor/prioridades-operacao';
import { DrizzleConfiguracaoDistribuicaoRepository } from '../distribuicao/infrastructure/persistence/drizzle-configuracao-distribuicao.repository';
import { DrizzlePrioridadesClienteRepository } from '../distribuicao/infrastructure/persistence/drizzle-prioridades-cliente.repository';
import { DrizzlePrioridadesOperacaoRepository } from '../distribuicao/infrastructure/persistence/drizzle-prioridades-operacao.repository';
import { DrizzleRegrasFrenteRepository } from '../distribuicao/infrastructure/persistence/drizzle-regras-frente.repository';
import { enfileirarReclassificacaoTipificacao } from '../ingestao/infrastructure/jobs/enfileirar-reclassificacao-tipificacao';
import { enfileirarReresolucaoClientes } from '../ingestao/infrastructure/jobs/enfileirar-reresolucao-clientes';
import { DrizzleRegistroAvisos } from '../ingestao/infrastructure/persistence/drizzle-registro-avisos';
import { avisosDosItensCriados, avisosDosPrecosRepetidos } from './avisos-da-carga';
import type { CatalogoMigrado } from './mapear-catalogo';
import type { CompetenciasMigradas } from './mapear-competencias';
import type { ConfiguracaoDistribuicaoMigrada } from './mapear-configuracao-distribuicao';
import type { DadosFiscaisMigrados } from './mapear-dados-fiscais';
import type { DemonstrativosMigrados } from './mapear-demonstrativos';
import type { DistribuicaoMigrada } from './mapear-distribuicao';
import type { EscalaMigrada } from './mapear-escala';
import type { MedicosMigrados } from './mapear-medicos';
import type { PrecosMigrados } from './mapear-precos';
import type { TipificacaoMigrada } from './mapear-tipificacao';

/** Linhas por insert: fica longe do limite de parâmetros do Postgres. */
const LOTE = 300;

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Regras de mescla das colunas que os dois sistemas conhecem, quando o valor do redo-one pode valer
 * mais que o do dashboards-one (a coluna que a carga não traz nem entra aqui: fica como está).
 * - `prevaleceRedo`: o valor do redo-one fica; o do dashboards-one só preenche o vazio. A cor foi
 *   refeita aqui; a conta MobileMed do médico é mapeada aqui (`mobilemed:mapear-medicos`, com
 *   auditoria) e regravar apagou 122 contas em 23/11/2026. A unificação do cliente
 *   (`unificadoEmId`) feita no redo-one também fica: a carga só preenche a que ela deriva (PRN,
 *   CEDIDIAG) e não desfaz a que o usuário decidiu aqui (os grupos por nome fantasia, 26/11/2026).
 * - `complemento`: o do dashboards-one vale, mas vazio lá não apaga o preenchido aqui.
 */
const MESCLA = {
  prevaleceRedo: new Set(['cor', 'idMobilemed', 'unificadoEmId']),
  complemento: new Set(['descricao']),
};

/**
 * O `set` do upsert: só as colunas que a carga traz (as chaves do objeto mapeado, mesmo com nulo)
 * recebem `excluded.coluna`; a que ela não traz fica como está no redo-one (insert com default
 * não pode sobrescrever a configuração feita na tela). A data de atualização acompanha.
 */
function colunasDaCarga(tabela: PgTable, chave: string[], trazidas: string[]): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [prop, coluna] of Object.entries(getTableColumns(tabela))) {
    if (chave.includes(prop)) continue;
    if (!trazidas.includes(prop) && !coluna.onUpdateFn) continue;
    const atual = `"${getTableName(tabela)}"."${coluna.name}"`;
    const novo = `excluded."${coluna.name}"`;
    set[prop] = sql.raw(
      MESCLA.prevaleceRedo.has(prop)
        ? `coalesce(${atual}, ${novo})`
        : MESCLA.complemento.has(prop)
          ? `coalesce(${novo}, ${atual})`
          : novo,
    );
  }
  return set;
}

/** Chaves com valor (`undefined` é ausente: o insert usaria o default). */
const trazidasPor = (linha: object) =>
  Object.entries(linha)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k)
    .sort();

/**
 * Insere em lotes; a linha que já existe (mesma chave) é atualizada só no que a carga traz. Linhas
 * com colunas diferentes vão em inserts separados, para uma não levar o default para a outra.
 * Rodar de novo dá o mesmo.
 */
async function upsert<T extends PgTable>(
  tx: Transacao,
  tabela: T,
  linhas: T['$inferInsert'][],
  chave: string[] = ['id'],
) {
  const colunas = getTableColumns(tabela);
  const alvo = chave.map((c) => colunas[c]).filter((c) => c !== undefined);
  const grupos = new Map<string, T['$inferInsert'][]>();
  for (const linha of linhas) {
    const assinatura = trazidasPor(linha as object).join(',');
    const grupo = grupos.get(assinatura);
    if (grupo) grupo.push(linha);
    else grupos.set(assinatura, [linha]);
  }
  for (const [assinatura, doGrupo] of grupos) {
    const set = colunasDaCarga(tabela, chave, assinatura.split(','));
    for (let i = 0; i < doGrupo.length; i += LOTE) {
      const insert = tx.insert(tabela).values(doGrupo.slice(i, i + LOTE) as never);
      await (Object.keys(set).length > 0
        ? insert.onConflictDoUpdate({ target: alvo as never, set })
        : insert.onConflictDoNothing());
    }
  }
}

/**
 * Grava o catálogo, os médicos e a escala migrados no banco do redo-one, numa transação só: ou
 * entra tudo, ou nada. A ordem respeita as chaves estrangeiras; as autorreferências (repasse do
 * contratado, principal do cliente, titular da cobertura) entram num segundo passo.
 */
export async function gravarMigracao(
  db: Database,
  { tabelas: c, removidos }: CatalogoMigrado,
  { tabelas: m }: MedicosMigrados,
  escala?: EscalaMigrada,
  distribuicao?: DistribuicaoMigrada,
  configuracaoDistribuicao?: ConfiguracaoDistribuicaoMigrada,
  competencias?: CompetenciasMigradas,
  dadosFiscais?: DadosFiscaisMigrados,
  tipificacao?: TipificacaoMigrada,
  precos?: PrecosMigrados,
  demonstrativos?: DemonstrativosMigrados,
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsert(tx, schema.modalidades, c.modalidades);
    await upsert(tx, schema.modalidadesDePara, c.modalidadesDePara, ['origem']);
    await upsert(tx, schema.especialidades, c.especialidades);
    await upsert(tx, schema.subespecialidades, c.subespecialidades);
    await upsert(tx, schema.subespecialidadesEspecialidades, c.subespecialidadesEspecialidades, [
      'subespecialidadeId',
      'especialidadeId',
    ]);
    await upsert(tx, schema.categoriasExame, c.categoriasExame);
    await upsert(tx, schema.prioridades, c.prioridades);
    await upsert(tx, schema.prioridadesDePara, c.prioridadesDePara);
    await upsert(tx, schema.especialidadesDePara, c.especialidadesDePara);
    await upsert(tx, schema.exames, c.exames);
    await upsert(tx, schema.quebrasEstudo, c.quebrasEstudo);
    await upsert(tx, schema.quebrasEstudoPecas, c.quebrasEstudoPecas);
    // Casa pela grafia: a linha que representa as repetidas pode mudar de uma carga para outra.
    await upsert(tx, schema.examesDeParaValores, c.examesDeParaValores, ['chaveNormalizada']);

    // O que uma carga anterior trouxe e esta não traz mais (MAMO, D.O, GERAL, frentes da escala,
    // OT): os exames já foram reapontados acima; sai o que ainda apontar para elas no catálogo.
    if (removidos.especialidades.length > 0) {
      await tx
        .delete(schema.subespecialidadesEspecialidades)
        .where(
          inArray(schema.subespecialidadesEspecialidades.especialidadeId, removidos.especialidades),
        );
      await tx
        .delete(schema.especialidadesDePara)
        .where(inArray(schema.especialidadesDePara.especialidadeId, removidos.especialidades));
      await tx
        .delete(schema.especialidades)
        .where(inArray(schema.especialidades.id, removidos.especialidades));
    }
    if (removidos.especialidadesDePara.length > 0) {
      await tx
        .delete(schema.especialidadesDePara)
        .where(inArray(schema.especialidadesDePara.id, removidos.especialidadesDePara));
    }
    if (removidos.modalidades.length > 0) {
      await tx
        .delete(schema.modalidades)
        .where(inArray(schema.modalidades.id, removidos.modalidades));
    }

    await upsert(
      tx,
      schema.contratados,
      c.contratados.map((ct) => ({ ...ct, contratadoRepasseId: null })),
    );
    for (const ct of c.contratados.filter((x) => x.contratadoRepasseId)) {
      await tx
        .update(schema.contratados)
        .set({ contratadoRepasseId: ct.contratadoRepasseId })
        .where(eq(schema.contratados.id, ct.id as string));
    }

    await upsert(
      tx,
      schema.clientes,
      c.clientes.map((cl) => ({ ...cl, unificadoEmId: null })),
    );
    for (const cl of c.clientes.filter((x) => x.unificadoEmId)) {
      await tx
        .update(schema.clientes)
        .set({ unificadoEmId: cl.unificadoEmId })
        .where(eq(schema.clientes.id, cl.id));
    }
    await upsert(tx, schema.clientesAliases, c.clientesAliases);
    await upsert(tx, schema.sufixosNomeCliente, c.sufixosNomeCliente);
    // Os laudos das competências abertas passam a seguir os clientes, apelidos e unificações da carga.
    await enfileirarReresolucaoClientes(tx);

    await upsert(tx, schema.medicos, m.medicos);
    await upsert(tx, schema.medicosDadosPagamento, m.medicosDadosPagamento, ['medicoId']);
    await upsert(tx, schema.medicosAliases, m.medicosAliases);
    await upsert(tx, schema.equipes, m.equipes);
    await upsert(tx, schema.equipesMembros, m.equipesMembros, ['equipeId', 'medicoId']);

    if (escala) await gravarEscala(tx, escala);
    if (distribuicao) await gravarDistribuicao(tx, distribuicao);
    if (configuracaoDistribuicao)
      await gravarConfiguracaoDistribuicao(tx, configuracaoDistribuicao);
    if (competencias)
      await upsert(tx, schema.competencias, competencias.tabelas.competencias, ['competencia']);
    // Sobrescreve o que mudou no redo-one: o dashboards-one é a fonte até a virada. Quem não tem
    // linha nesta carga (principal criado na carga) só perde a exclusão fiscal que não está mais lá.
    if (dadosFiscais) {
      await upsert(tx, schema.clientesDadosFiscais, dadosFiscais.tabelas.clientesDadosFiscais, [
        'clienteId',
      ]);
      if (dadosFiscais.desmarcarExclusaoFiscal.length > 0)
        await tx
          .update(schema.clientesDadosFiscais)
          .set({ exclusaoFiscal: false })
          .where(
            inArray(schema.clientesDadosFiscais.clienteId, dadosFiscais.desmarcarExclusaoFiscal),
          );
    }
    if (tipificacao) await gravarTipificacao(tx, tipificacao);
    if (precos) await gravarPrecos(tx, precos);
    if (demonstrativos) await gravarDemonstrativosLegado(tx, demonstrativos);
    await semearParametrosDemonstrativo(tx);
  });
}

/**
 * O retrato dos demonstrativos fechados do dashboards-one: cópia do que foi faturado lá, refeita a
 * cada carga (membros e itens trocados pelos de lá).
 */
async function gravarDemonstrativosLegado(tx: Transacao, { tabelas: d }: DemonstrativosMigrados) {
  await upsert(tx, schema.demonstrativosFaturamentoLegado, d.demonstrativos);
  const ids = d.demonstrativos.map((x) => x.id as string);
  if (ids.length === 0) return;
  await tx
    .delete(schema.demonstrativosFaturamentoLegadoMembros)
    .where(inArray(schema.demonstrativosFaturamentoLegadoMembros.demonstrativoId, ids));
  await tx
    .delete(schema.demonstrativosFaturamentoLegadoItens)
    .where(inArray(schema.demonstrativosFaturamentoLegadoItens.demonstrativoId, ids));
  for (let i = 0; i < d.membros.length; i += 1000)
    await tx
      .insert(schema.demonstrativosFaturamentoLegadoMembros)
      .values(d.membros.slice(i, i + 1000));
  for (let i = 0; i < d.itens.length; i += 1000)
    await tx.insert(schema.demonstrativosFaturamentoLegadoItens).values(d.itens.slice(i, i + 1000));
}

/**
 * O que o dashboards-one tinha fixo no código vira a primeira versão (desde sempre) dos parâmetros
 * do demonstrativo e das prioridades alternativas: duplicados entram, cliente inativo fica fora,
 * categoria SC e prioridade ROTINA quando faltam, PLANTÃO ↔ URGÊNCIA. Só se a tabela estiver
 * vazia: o que a tela gravou fica.
 */
async function semearParametrosDemonstrativo(tx: Transacao) {
  const id = async (
    tabela: typeof schema.categoriasExame | typeof schema.prioridades,
    nome: string,
  ) =>
    (await tx.select({ id: tabela.id }).from(tabela).where(eq(tabela.nome, nome)))[0]?.id ?? null;
  const [parametros] = await tx
    .select({ id: schema.parametrosDemonstrativo.id })
    .from(schema.parametrosDemonstrativo)
    .limit(1);
  if (!parametros) {
    await tx.insert(schema.parametrosDemonstrativo).values({
      desde: null,
      cobraDuplicados: true,
      cobraClientesInativos: false,
      categoriaPadraoId: await id(schema.categoriasExame, 'SC'),
      prioridadePadraoId: await id(schema.prioridades, 'ROTINA'),
    });
  }
  const [alternativa] = await tx
    .select({ id: schema.prioridadesAlternativasPreco.id })
    .from(schema.prioridadesAlternativasPreco)
    .limit(1);
  const [plantao, urgencia] = [
    await id(schema.prioridades, 'PLANTÃO'),
    await id(schema.prioridades, 'URGÊNCIA'),
  ];
  if (!alternativa && plantao && urgencia) {
    await tx.insert(schema.prioridadesAlternativasPreco).values([
      { prioridadeId: plantao, alternativaId: urgencia, desde: null },
      { prioridadeId: urgencia, alternativaId: plantao, desde: null },
    ]);
  }
}

type Executor = Database | Transacao;

/**
 * Clientes e contratados cuja tabela de preços já tem história no redo-one: alguma versão criada,
 * encerrada, reaberta ou apagada por alguém (a carga não grava auditoria nem autor). A carga não
 * mexe neles.
 */
export async function precosComHistoriaNoRedo(
  db: Executor,
): Promise<{ clientes: string[]; contratados: string[] }> {
  const donos = async (tabela: 'precos_cliente' | 'precos_padrao_contratado') => {
    const col = tabela === 'precos_cliente' ? 'clienteId' : 'contratadoId';
    const colSql = sql.raw(tabela === 'precos_cliente' ? 'cliente_id' : 'contratado_id');
    const entidade = tabela === 'precos_cliente' ? 'preco_cliente' : 'preco_padrao_contratado';
    const r = await db.execute<{ dono: string }>(sql`
      select ${colSql}::text dono from ${sql.raw(tabela)} where criado_por_id is not null
      union
      select coalesce(e.depois->>${col}, e.antes->>${col}) from eventos_auditoria e
        where e.entidade = ${entidade} and coalesce(e.depois->>${col}, e.antes->>${col}) is not null
      union
      select p.${colSql}::text from eventos_auditoria e
        join ${sql.raw(tabela)} p on p.id::text = e.entidade_id
        where e.entidade = ${entidade}`);
    return r.rows.map((l) => l.dono).sort();
  };
  return {
    clientes: await donos('precos_cliente'),
    contratados: await donos('precos_padrao_contratado'),
  };
}

/**
 * Preços: por cliente (e por contratado, na tabela padrão), a tabela sem história no redo-one é
 * trocada inteira pela da carga (sai a versão que veio de uma carga anterior e não está mais lá; o
 * resto é gravado pelo id estável da linha do dashboards-one), então rodar de novo dá o mesmo e
 * nunca deixa duas versões valendo. Quem já tem história no redo-one (`precosComHistoriaNoRedo`)
 * fica como está: o relatório da carga o lista.
 */
async function gravarPrecos(
  tx: Transacao,
  { tabelas, catalogo, precosRepetidos, itensCriados }: PrecosMigrados,
) {
  // Categorias e prioridades que só os preços do dashboards-one usam: entram antes dos preços. Só
  // vêm as que ainda não estão no redo-one, então o que a tela mudou nelas fica.
  await upsert(tx, schema.categoriasExame, catalogo.categoriasExame);
  await upsert(tx, schema.prioridades, catalogo.prioridades);
  // A mesma trava por dono da tela (`DrizzlePrecosRepository.aplicar`), antes de ler quem tem
  // história: uma mudança pela tela durante a carga espera, ou a carga espera por ela.
  const donos = async (tipo: 'cliente' | 'contratado', coluna: AnyPgColumn, daCarga: string[]) => [
    ...new Set([
      ...daCarga,
      ...(
        await tx
          .selectDistinct({ dono: coluna })
          .from(tipo === 'cliente' ? schema.precosCliente : schema.precosPadraoContratado)
      ).map((l) => String(l.dono)),
    ]),
  ];
  for (const [tipo, ids] of [
    [
      'cliente',
      await donos(
        'cliente',
        schema.precosCliente.clienteId,
        tabelas.precosCliente.map((l) => l.clienteId),
      ),
    ],
    [
      'contratado',
      await donos(
        'contratado',
        schema.precosPadraoContratado.contratadoId,
        tabelas.precosPadraoContratado.map((l) => l.contratadoId),
      ),
    ],
  ] as const)
    for (const id of [...ids].sort())
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`precos:${tipo}:${id}`}))`);
  const protegidos = await precosComHistoriaNoRedo(tx);
  // Cada preço repetido com valores diferentes e cada item do catálogo que só os preços usam vira
  // aviso; o que esta carga não acha mais se resolve.
  const registro = new DrizzleRegistroAvisos();
  const agora = new Date();
  await registro.sincronizar(tx, {
    tipo: 'preco_repetido',
    origem: 'carga',
    levantados: avisosDosPrecosRepetidos(precosRepetidos, protegidos),
    agora,
  });
  await registro.sincronizar(tx, {
    tipo: 'catalogo_criado_carga',
    origem: 'carga',
    levantados: avisosDosItensCriados(itensCriados),
    agora,
  });
  const trocar = async <
    T extends typeof schema.precosCliente | typeof schema.precosPadraoContratado,
  >(
    tabela: T,
    coluna: AnyPgColumn,
    idColuna: AnyPgColumn,
    linhas: (T['$inferInsert'] & { id: string })[],
    donoDe: (l: T['$inferInsert']) => string,
    fora: string[],
  ) => {
    const pulados = new Set(fora);
    const porDono = new Map<string, string[]>();
    for (const l of linhas) {
      const dono = donoDe(l);
      if (!pulados.has(dono)) porDono.set(dono, [...(porDono.get(dono) ?? []), l.id]);
    }
    const existentes = (await tx.selectDistinct({ dono: coluna }).from(tabela as PgTable)).map(
      (l) => String(l.dono),
    );
    for (const dono of new Set([...porDono.keys(), ...existentes])) {
      if (pulados.has(dono)) continue;
      const ids = porDono.get(dono) ?? [];
      await tx
        .delete(tabela as PgTable)
        .where(and(eq(coluna, dono), ...(ids.length ? [notInArray(idColuna, ids)] : [])));
    }
    await upsert(
      tx,
      tabela,
      linhas.filter((l) => !pulados.has(donoDe(l))),
    );
  };
  await trocar(
    schema.precosCliente,
    schema.precosCliente.clienteId,
    schema.precosCliente.id,
    tabelas.precosCliente,
    (l) => l.clienteId,
    protegidos.clientes,
  );
  await trocar(
    schema.precosPadraoContratado,
    schema.precosPadraoContratado.contratadoId,
    schema.precosPadraoContratado.id,
    tabelas.precosPadraoContratado,
    (l) => l.contratadoId,
    protegidos.contratados,
  );
}

/**
 * Clientes (e regras e sub-regras) cuja tipificação já tem história no redo-one: alguma versão
 * criada, encerrada, reaberta ou apagada por alguém pela tela (a carga não grava auditoria nem
 * autor), ou a configuração salva pela tela antes do histórico por vigência. A carga não mexe neles.
 */
export async function tipificacaoComHistoriaNoRedo(
  db: Executor,
): Promise<{ clientes: string[]; regras: string[]; subregras: string[] }> {
  const donos = async (
    tabela: string,
    coluna: string,
    campo: string,
    entidade: string,
    antiga: { entidade: string; campo: string | null },
  ) => {
    const col = sql.raw(coluna);
    const r = await db.execute<{ dono: string }>(sql`
      select ${col}::text dono from ${sql.raw(tabela)} where criado_por_id is not null
      union
      select coalesce(e.depois->>${campo}, e.antes->>${campo}) from eventos_auditoria e
        where e.entidade = ${entidade} and coalesce(e.depois->>${campo}, e.antes->>${campo}) is not null
      union
      select v.${col}::text from eventos_auditoria e
        join ${sql.raw(tabela)} v on v.id::text = e.entidade_id
        where e.entidade = ${entidade}
      union
      select e.entidade_id from eventos_auditoria e
        where e.entidade = ${antiga.entidade}
          and (${antiga.campo}::text is null or e.depois ? ${antiga.campo ?? ''})`);
    return r.rows.map((l) => l.dono).sort();
  };
  return {
    clientes: await donos(
      'clientes_tipificacao_versoes',
      'cliente_id',
      'clienteId',
      'cliente_tipificacao_versao',
      { entidade: 'cliente_tipificacao', campo: null },
    ),
    regras: await donos(
      'regras_tipificacao_fatura',
      'regra_id',
      'regraId',
      'regra_tipificacao_fatura',
      { entidade: 'regra_tipificacao', campo: 'faturaSemSubregra' },
    ),
    subregras: await donos(
      'subregras_tipificacao_fatura',
      'subregra_id',
      'subregraId',
      'subregra_tipificacao_fatura',
      { entidade: 'subregra_tipificacao', campo: 'fatura' },
    ),
  };
}

/**
 * Tipificação: regras e sub-regras pelo id. A configuração de hoje de cada cliente e o "fatura" de
 * cada regra e sub-regra entram como versão inicial, sem início (vale para tudo o que veio antes); o
 * histórico de quem não tem história no redo-one é trocado inteiro pelo da carga (o dashboards-one
 * é a fonte até a virada), então rodar de novo dá o mesmo. Quem tem história no redo-one
 * (`tipificacaoComHistoriaNoRedo`) fica como está: o relatório da carga o lista. Na mesma
 * transação, a reclassificação de todos os laudos das competências abertas.
 */
async function gravarTipificacao(tx: Transacao, { tabelas: t }: TipificacaoMigrada) {
  const protegidos = await tipificacaoComHistoriaNoRedo(tx);
  await upsert(tx, schema.regrasTipificacao, t.regrasTipificacao);
  await upsert(tx, schema.subregrasTipificacao, t.subregrasTipificacao);

  const trocar = async <
    T extends
      | typeof schema.regrasTipificacaoFatura
      | typeof schema.subregrasTipificacaoFatura
      | typeof schema.clientesTipificacaoVersoes,
  >(
    tabela: T,
    coluna: AnyPgColumn,
    linhas: (Omit<T['$inferInsert'], 'vigenciaDesde'> & { id: string })[],
    donoDe: (l: Omit<T['$inferInsert'], 'vigenciaDesde'>) => string,
    fora: string[],
  ) => {
    const pulados = new Set(fora);
    const existentes = (await tx.selectDistinct({ dono: coluna }).from(tabela as PgTable)).map(
      (l) => String(l.dono),
    );
    const trocados = [...new Set([...linhas.map(donoDe), ...existentes])].filter(
      (d) => !pulados.has(d),
    );
    if (trocados.length) await tx.delete(tabela as PgTable).where(inArray(coluna, trocados));
    const novas = linhas
      .filter((l) => !pulados.has(donoDe(l)))
      .map((l) => ({ ...l, vigenciaDesde: null }));
    return novas as unknown as T['$inferInsert'][];
  };
  const faturaRegras = await trocar(
    schema.regrasTipificacaoFatura,
    schema.regrasTipificacaoFatura.regraId,
    t.regrasTipificacaoFatura,
    (l) => l.regraId as string,
    protegidos.regras,
  );
  if (faturaRegras.length) await tx.insert(schema.regrasTipificacaoFatura).values(faturaRegras);
  const faturaSubs = await trocar(
    schema.subregrasTipificacaoFatura,
    schema.subregrasTipificacaoFatura.subregraId,
    t.subregrasTipificacaoFatura,
    (l) => l.subregraId as string,
    protegidos.subregras,
  );
  if (faturaSubs.length) await tx.insert(schema.subregrasTipificacaoFatura).values(faturaSubs);
  // As linhas saem junto com a versão (cascade).
  const versoes = await trocar(
    schema.clientesTipificacaoVersoes,
    schema.clientesTipificacaoVersoes.clienteId,
    t.clientesTipificacaoVersoes,
    (l) => l.clienteId as string,
    protegidos.clientes,
  );
  if (versoes.length) await tx.insert(schema.clientesTipificacaoVersoes).values(versoes);
  const gravadas = new Set(versoes.map((v) => v.id));
  const linhas = t.clientesTipificacaoLinhas.filter((l) => gravadas.has(l.versaoId));
  const dasLinhas = new Set(linhas.map((l) => l.id));
  const filhas = <L extends { linhaId: string }>(lista: L[]) =>
    lista.filter((x) => dasLinhas.has(x.linhaId));
  if (linhas.length) await tx.insert(schema.clientesTipificacaoLinhas).values(linhas);
  const mods = filhas(t.clientesTipificacaoLinhasModalidades);
  const esps = filhas(t.clientesTipificacaoLinhasEspecialidades);
  const pris = filhas(t.clientesTipificacaoLinhasPrioridades);
  const meds = filhas(t.clientesTipificacaoLinhasMedicos);
  const eqs = filhas(t.clientesTipificacaoLinhasEquipes);
  if (mods.length) await tx.insert(schema.clientesTipificacaoLinhasModalidades).values(mods);
  if (esps.length) await tx.insert(schema.clientesTipificacaoLinhasEspecialidades).values(esps);
  if (pris.length) await tx.insert(schema.clientesTipificacaoLinhasPrioridades).values(pris);
  if (meds.length) await tx.insert(schema.clientesTipificacaoLinhasMedicos).values(meds);
  if (eqs.length) await tx.insert(schema.clientesTipificacaoLinhasEquipes).values(eqs);
  // Os laudos das competências abertas passam a seguir a configuração carregada.
  await enfileirarReclassificacaoTipificacao(tx, null);
}

/**
 * Configuração do robô. Usa os repositórios da distribuição (a mesma gravação da tela) dentro da
 * transação da carga: a global é trocada inteira, e as regras de cada frente e as prioridades de
 * cada cliente que a carga traz também (o dashboards-one é a fonte). Frente ou cliente que a
 * carga não traz fica como está.
 */
async function gravarConfiguracaoDistribuicao(tx: Transacao, c: ConfiguracaoDistribuicaoMigrada) {
  // A transação tem a mesma interface de consulta do banco (a `transaction` aninhada vira savepoint).
  const db = tx as unknown as Database;
  if (c.configuracao)
    await new DrizzleConfiguracaoDistribuicaoRepository(db).salvar(c.configuracao);
  await gravarPrioridadesOperacao(tx, c);
  const regras = new DrizzleRegrasFrenteRepository(db);
  for (const r of c.regrasFrente) await regras.salvar(r);
  const prioridades = new DrizzlePrioridadesClienteRepository(db);
  for (const p of c.prioridadesCliente) await prioridades.substituir(p.clienteId, p.itens);
}

/**
 * Prioridades da operação pelos ids estáveis (upsert) e a grade geral trocada inteira. A carga é a
 * fonte: a grafia que estava no de-para de outra prioridade passa para a da carga, e a prioridade
 * criada pela tela com o mesmo nome dá lugar à da carga.
 */
async function gravarPrioridadesOperacao(tx: Transacao, c: ConfiguracaoDistribuicaoMigrada) {
  if (!c.prioridadesOperacao.length) return;
  const t = schema.prioridadesOperacao;
  const ids = c.prioridadesOperacao.map((p) => p.id);
  // A cor é escolhida na tela (a carga não traz): fica a que já havia, pelo nome.
  const corDe = new Map(
    (await tx.select({ nome: t.nome, cor: t.cor }).from(t)).map((l) => [
      l.nome.toUpperCase(),
      l.cor,
    ]),
  );
  await tx.delete(t).where(
    and(
      notInArray(t.id, ids),
      inArray(
        sql`upper(${t.nome})`,
        c.prioridadesOperacao.map((p) => p.nome.toUpperCase()),
      ),
    ),
  );
  await tx.delete(schema.prioridadesOperacaoGrafias).where(
    inArray(
      schema.prioridadesOperacaoGrafias.grafiaNormalizada,
      c.prioridadesOperacao.flatMap((p) => p.grafias.map(normalizarGrafia)),
    ),
  );
  if (c.prioridadesOperacao.some((p) => p.padrao)) await tx.update(t).set({ padrao: false });
  const repo = new DrizzlePrioridadesOperacaoRepository(tx as unknown as Database);
  for (const p of c.prioridadesOperacao) {
    await tx
      .insert(t)
      .values({ id: p.id, nome: p.nome, posicao: p.posicao, urgencia: 'nunca' })
      .onConflictDoNothing();
    await repo.salvar({ ...p, cor: p.cor ?? corDe.get(p.nome.toUpperCase()) ?? null });
  }
  await repo.salvarGrade(c.gradeRecebimento);
}

/**
 * Distribuição. Para cada médico ou equipe que a carga traz com arranjo, a lista inteira é a do
 * dashboards-one (os eixos caem junto em cascata); quem não tinha arranjo lá fica como está.
 */
async function gravarDistribuicao(tx: Transacao, { tabelas: d }: DistribuicaoMigrada) {
  const medicos = [...new Set(d.arranjos.flatMap((a) => (a.medicoId ? [a.medicoId] : [])))];
  const equipes = [...new Set(d.arranjos.flatMap((a) => (a.equipeId ? [a.equipeId] : [])))];
  if (medicos.length)
    await tx.delete(schema.arranjos).where(inArray(schema.arranjos.medicoId, medicos));
  if (equipes.length)
    await tx.delete(schema.arranjos).where(inArray(schema.arranjos.equipeId, equipes));
  await upsert(tx, schema.arranjos, d.arranjos);
  await upsert(tx, schema.arranjosModalidades, d.arranjosModalidades, [
    'arranjoId',
    'modalidadeId',
  ]);
  await upsert(tx, schema.arranjosSubespecialidades, d.arranjosSubespecialidades, [
    'arranjoId',
    'subespecialidadeId',
  ]);
  await upsert(tx, schema.arranjosPrioridades, d.arranjosPrioridades, [
    'arranjoId',
    'prioridadeId',
  ]);
  await upsert(tx, schema.arranjosClientes, d.arranjosClientes, ['arranjoId', 'clienteId']);
  await upsert(tx, schema.arranjosExames, d.arranjosExames, ['arranjoId', 'exameId']);
  await upsert(tx, schema.arranjosClientesExclusivos, d.arranjosClientesExclusivos, [
    'arranjoId',
    'clienteId',
  ]);
  await upsert(tx, schema.medicosDistribuicao, d.medicosDistribuicao, ['medicoId']);
}

/**
 * Escala. Os recortes (frentes do turno, prioridades e subespecialidades da alocação, frentes e
 * turnos da ausência, escopo da gestora) são trocados inteiros para os registros que a carga
 * traz: o dashboards-one é a fonte da verdade, e assim rodar de novo dá o mesmo resultado.
 */
async function gravarEscala(tx: Transacao, escala: EscalaMigrada) {
  const { tabelas: migradas } = escala;
  const e = remapearFrentes(migradas, await gravarFrentes(tx, migradas.frentesEscala));
  const trocar = async <T extends PgTable>(
    tabela: T,
    coluna: AnyPgColumn,
    donos: string[],
    linhas: T['$inferInsert'][],
    chave: string[],
  ) => {
    if (donos.length > 0) await tx.delete(tabela).where(inArray(coluna, donos));
    await upsert(tx, tabela, linhas, chave);
  };

  await upsert(tx, schema.turnos, e.turnos);
  await trocar(
    schema.turnosFrentes,
    schema.turnosFrentes.turnoId,
    e.turnos.map((t) => t.id),
    e.turnosFrentes,
    ['turnoId', 'frenteId'],
  );

  await upsert(
    tx,
    schema.alocacoes,
    e.alocacoes.map((a) => ({ ...a, coberturaDeId: null })),
  );
  for (const a of e.alocacoes.filter((x) => x.coberturaDeId)) {
    await tx
      .update(schema.alocacoes)
      .set({ coberturaDeId: a.coberturaDeId })
      .where(eq(schema.alocacoes.id, a.id));
  }
  const alocacaoIds = e.alocacoes.map((a) => a.id);
  await trocar(
    schema.alocacoesPrioridades,
    schema.alocacoesPrioridades.alocacaoId,
    alocacaoIds,
    e.alocacoesPrioridades,
    ['alocacaoId', 'prioridadeId'],
  );
  await trocar(
    schema.alocacoesSubespecialidades,
    schema.alocacoesSubespecialidades.alocacaoId,
    alocacaoIds,
    e.alocacoesSubespecialidades,
    ['alocacaoId', 'subespecialidadeId'],
  );
  // Casa pela alocação e o dia: a tela pode já ter criado o ajuste com outro id. Vale o do
  // dashboards-one, inclusive o id (é o que o histórico migrado cita).
  await upsert(tx, schema.ajustesProdutividade, e.ajustesProdutividade, ['alocacaoId', 'data']);

  // Tipos de ausência são cadastro editável: a carga só cria o que falta e não sobrescreve.
  // Se já houver um tipo com o mesmo nome (semeado por outro caminho), a ausência usa esse.
  if (e.tiposAusencia.length > 0)
    await tx.insert(schema.tiposAusencia).values(e.tiposAusencia).onConflictDoNothing();
  // A cor é a única coisa que a carga completa num tipo existente, e só se ele não tiver nenhuma.
  for (const tipo of e.tiposAusencia)
    if (tipo.cor)
      await tx
        .update(schema.tiposAusencia)
        .set({ cor: tipo.cor })
        .where(and(eq(schema.tiposAusencia.nome, tipo.nome), isNull(schema.tiposAusencia.cor)));
  const existentes = await tx
    .select({ id: schema.tiposAusencia.id, nome: schema.tiposAusencia.nome })
    .from(schema.tiposAusencia);
  const idsExistentes = new Set(existentes.map((t) => t.id));
  const porNome = new Map(existentes.map((t) => [t.nome, t.id]));
  const tipoFinal = new Map(
    e.tiposAusencia.map((t) => [
      t.id,
      idsExistentes.has(t.id) ? t.id : (porNome.get(t.nome) ?? t.id),
    ]),
  );
  await upsert(
    tx,
    schema.ausencias,
    e.ausencias.map((a) => ({ ...a, tipoId: tipoFinal.get(a.tipoId) ?? a.tipoId })),
  );
  const ausenciaIds = e.ausencias.map((a) => a.id);
  await trocar(
    schema.ausenciasFrentes,
    schema.ausenciasFrentes.ausenciaId,
    ausenciaIds,
    e.ausenciasFrentes,
    ['ausenciaId', 'frenteId'],
  );
  await trocar(
    schema.ausenciasTurnos,
    schema.ausenciasTurnos.ausenciaId,
    ausenciaIds,
    e.ausenciasTurnos,
    ['ausenciaId', 'turnoId'],
  );

  const comRecorte = [...new Set(e.usuariosEscoposEscala.map((u) => u.usuarioId))];
  await trocar(
    schema.usuariosEscoposEscala,
    schema.usuariosEscoposEscala.usuarioId,
    comRecorte,
    e.usuariosEscoposEscala,
    ['id'],
  );
  // "Vê toda a escala" é explícito (vazio nunca é "toda a escala"): quem tem recorte no
  // dashboards-one fica sem ele; quem não tem lá e ainda não tem recorte aqui ganha o "todos".
  if (comRecorte.length) {
    await tx
      .update(schema.usuarios)
      .set({ veTodaEscala: false })
      .where(inArray(schema.usuarios.id, comRecorte));
  }
  if (escala.usuariosVeemTodaEscala.length) {
    await tx
      .update(schema.usuarios)
      .set({ veTodaEscala: true })
      .where(
        and(
          inArray(schema.usuarios.id, escala.usuariosVeemTodaEscala),
          notExists(
            tx
              .select({ um: sql`1` })
              .from(schema.usuariosEscoposEscala)
              .where(eq(schema.usuariosEscoposEscala.usuarioId, schema.usuarios.id)),
          ),
        ),
      );
  }
  await upsert(tx, schema.eventosAuditoria, e.eventosAuditoria);
  await encerrarSumidas(tx, escala);
  await recusarSumidas(tx, escala);
}

/** Uma alocação que veio do dashboards-one e não existe mais lá. */
export interface AlocacaoSumida {
  id: string;
  medicoId: string;
  turnoId: string;
  frenteId: string;
  dataInicio: string;
  dataFim: string | null;
}

/**
 * As alocações que vieram do dashboards-one (id derivado do de lá: UUID versão 5; a tela cria
 * versão 4) e não existem mais lá, ainda vigentes depois de ontem. `encerrar` são as que a carga
 * fecha em ontem; `futuras` começariam depois de ontem, então não há como encerrá-las sem apagar:
 * ficam como estão, para a pessoa decidir. Só leitura.
 */
export async function alocacoesSumidasDoLegado(
  db: Pick<Database, 'select'>,
  { legado }: Pick<EscalaMigrada, 'legado'>,
): Promise<{ encerrar: AlocacaoSumida[]; futuras: AlocacaoSumida[] }> {
  const a = schema.alocacoes;
  const linhas = await db
    .select({
      id: a.id,
      medicoId: a.medicoId,
      turnoId: a.turnoId,
      frenteId: a.frenteId,
      dataInicio: a.dataInicio,
      dataFim: a.dataFim,
    })
    .from(a)
    .where(
      and(
        sql`substring(${a.id}::text, 15, 1) = '5'`,
        legado.alocacaoIds.length ? notInArray(a.id, legado.alocacaoIds) : undefined,
        or(isNull(a.dataFim), sql`${a.dataFim} > ${legado.ontem}::date`),
      ),
    )
    .orderBy(a.dataInicio, a.id);
  return {
    encerrar: linhas.filter((l) => l.dataInicio <= legado.ontem),
    futuras: linhas.filter((l) => l.dataInicio > legado.ontem),
  };
}

/** Encerra em ontem as alocações que sumiram do dashboards-one, com o evento de auditoria. */
async function encerrarSumidas(tx: Transacao, escala: EscalaMigrada) {
  const { encerrar } = await alocacoesSumidasDoLegado(tx as unknown as Database, escala);
  if (!encerrar.length) return;
  const { ontem } = escala.legado;
  await tx
    .update(schema.alocacoes)
    .set({ dataFim: ontem })
    .where(
      inArray(
        schema.alocacoes.id,
        encerrar.map((a) => a.id),
      ),
    );
  await tx.insert(schema.eventosAuditoria).values(
    encerrar.map((a) => ({
      ocorridoEm: new Date(),
      atorTipo: 'sistema',
      atorId: null,
      entidade: 'alocacao',
      entidadeId: a.id,
      acao: 'encerrado',
      antes: { dataFim: a.dataFim },
      depois: {
        dataFim: ontem,
        medicoId: a.medicoId,
        turnoId: a.turnoId,
        frenteId: a.frenteId,
        motivo: 'Apagada no dashboards-one: encerrada pela carga.',
      },
    })),
  );
}

/** Uma ausência que veio do dashboards-one e não existe mais lá. */
export interface AusenciaSumida {
  id: string;
  medicoId: string;
  situacao: 'pendente' | 'aprovada' | 'recusada';
  dataInicio: string;
  dataFim: string;
}

const MOTIVO_RECUSA_SUMIDA = 'Apagada no dashboards-one: recusada pela carga.';

/**
 * As ausências que vieram do dashboards-one (UUID versão 5) e não existem mais lá, ainda não
 * recusadas. Apagar tiraria do histórico; encerrar não cabe (a ausência pode nem ter começado):
 * a carga as recusa. Só leitura.
 */
export async function ausenciasSumidasDoLegado(
  db: Pick<Database, 'select'>,
  { legado }: Pick<EscalaMigrada, 'legado'>,
): Promise<AusenciaSumida[]> {
  const a = schema.ausencias;
  return db
    .select({
      id: a.id,
      medicoId: a.medicoId,
      situacao: a.situacao,
      dataInicio: a.dataInicio,
      dataFim: a.dataFim,
    })
    .from(a)
    .where(
      and(
        sql`substring(${a.id}::text, 15, 1) = '5'`,
        legado.ausenciaIds.length ? notInArray(a.id, legado.ausenciaIds) : undefined,
        sql`${a.situacao} <> 'recusada'`,
      ),
    )
    .orderBy(a.dataInicio, a.id);
}

/** Recusa as ausências que sumiram do dashboards-one, com o evento de auditoria do sistema. */
async function recusarSumidas(tx: Transacao, escala: EscalaMigrada) {
  const sumidas = await ausenciasSumidasDoLegado(tx as unknown as Database, escala);
  if (!sumidas.length) return;
  const ids = sumidas.map((a) => a.id);
  const em = new Date();
  const recorte = async (tabela: typeof schema.ausenciasFrentes | typeof schema.ausenciasTurnos) =>
    tx.select().from(tabela).where(inArray(tabela.ausenciaId, ids));
  const frentes = (await recorte(schema.ausenciasFrentes)) as {
    ausenciaId: string;
    frenteId: string;
  }[];
  const turnos = (await recorte(schema.ausenciasTurnos)) as {
    ausenciaId: string;
    turnoId: string;
  }[];
  await tx
    .update(schema.ausencias)
    .set({ situacao: 'recusada', motivoRecusa: MOTIVO_RECUSA_SUMIDA, revisadaEm: em })
    .where(inArray(schema.ausencias.id, ids));
  await tx.insert(schema.eventosAuditoria).values(
    sumidas.map((a) => {
      const contexto = {
        medicoId: a.medicoId,
        frenteIds: frentes.filter((f) => f.ausenciaId === a.id).map((f) => f.frenteId),
        turnoIds: turnos.filter((t) => t.ausenciaId === a.id).map((t) => t.turnoId),
      };
      return {
        ocorridoEm: em,
        atorTipo: 'sistema',
        atorId: null,
        entidade: 'ausencia',
        entidadeId: a.id,
        acao: 'recusada',
        antes: { ...contexto, situacao: a.situacao },
        depois: { ...contexto, situacao: 'recusada', motivoRecusaAlterado: true },
      };
    }),
  );
}

type Frentes = EscalaMigrada['tabelas']['frentesEscala'];

/**
 * Grava as frentes e devolve id da carga → id que vale no banco. A frente pode já existir com
 * outro id (a tela cria a da especialidade ou modalidade ao gravar um turno): aí fica a que já
 * existe, e a carga passa a apontar para ela.
 */
async function gravarFrentes(tx: Transacao, frentes: Frentes): Promise<Map<string, string>> {
  if (frentes.length === 0) return new Map();
  await tx.insert(schema.frentesEscala).values(frentes).onConflictDoNothing();
  const f = schema.frentesEscala;
  const especialidadeIds = frentes.flatMap((x) => (x.especialidadeId ? [x.especialidadeId] : []));
  const modalidadeIds = frentes.flatMap((x) => (x.modalidadeId ? [x.modalidadeId] : []));
  const gravadas = await tx
    .select({ id: f.id, especialidadeId: f.especialidadeId, modalidadeId: f.modalidadeId })
    .from(f)
    .where(
      or(
        especialidadeIds.length ? inArray(f.especialidadeId, especialidadeIds) : undefined,
        modalidadeIds.length ? inArray(f.modalidadeId, modalidadeIds) : undefined,
      ),
    );
  const destino = (x: { especialidadeId?: string | null; modalidadeId?: string | null }) =>
    x.especialidadeId ? `e:${x.especialidadeId}` : `m:${x.modalidadeId}`;
  const real = new Map(gravadas.map((g) => [destino(g), g.id]));
  return new Map(frentes.map((x) => [x.id, real.get(destino(x)) ?? x.id]));
}

/** Troca, em tudo que a carga grava, o id da frente pelo que vale no banco. */
function remapearFrentes(
  e: EscalaMigrada['tabelas'],
  ids: Map<string, string>,
): EscalaMigrada['tabelas'] {
  if ([...ids].every(([de, para]) => de === para)) return e;
  const id = <T extends string | null | undefined>(v: T): T =>
    (typeof v === 'string' ? (ids.get(v) ?? v) : v) as T;
  const json = <T>(v: T): T =>
    v === null || v === undefined
      ? v
      : (JSON.parse(JSON.stringify(v), (_, x) => (typeof x === 'string' ? id(x) : x)) as T);
  return {
    ...e,
    turnosFrentes: e.turnosFrentes.map((x) => ({ ...x, frenteId: id(x.frenteId) })),
    alocacoes: e.alocacoes.map((x) => ({ ...x, frenteId: id(x.frenteId) })),
    ausenciasFrentes: e.ausenciasFrentes.map((x) => ({ ...x, frenteId: id(x.frenteId) })),
    usuariosEscoposEscala: e.usuariosEscoposEscala.map((x) => ({
      ...x,
      frenteId: id(x.frenteId),
    })),
    eventosAuditoria: e.eventosAuditoria.map((x) => ({
      ...x,
      entidadeId: id(x.entidadeId),
      antes: json(x.antes),
      depois: json(x.depois),
    })),
  };
}
