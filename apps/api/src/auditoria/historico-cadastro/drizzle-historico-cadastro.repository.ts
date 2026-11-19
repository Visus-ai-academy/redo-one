import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';

import type { Paginacao } from '../../catalogo/comum/paginacao';
import { DATABASE, type Database } from '../../database/database';
import { chavesRobo, eventosAuditoria as e, usuarios } from '../../database/schema';
import type {
  AlvoHistorico,
  HistoricoCadastroRepository,
  ItemHistoricoCadastro,
  PaginaHistoricoCadastro,
} from './historico-cadastro.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ações do médico que são da aba Pagamento (`medicos.pagamento.ver`). */
const ACOES_PAGAMENTO = ['pagamento_lido', 'pagamento_alterado'];
/** Ações de `usuario` que ligam ou desligam a conta do portal de um médico (aba Acesso). */
const ACOES_ACESSO = ['convidado', 'medico_vinculado', 'medico_desvinculado'];

/** O evento cita `campo` = `id` no antes ou no depois. */
const cita = (campo: string, id: string) =>
  sql`(${e.antes}->>${campo} = ${id} or ${e.depois}->>${campo} = ${id})`;

/** O médico está na lista `medicoIds` do antes (ou do depois) do evento da equipe. */
const naEquipe = (lado: typeof e.antes | typeof e.depois, id: string) =>
  sql`coalesce(${lado}->'medicoIds' @> jsonb_build_array(${id}::text), false)`;

/**
 * Evento de equipe em que a participação do médico mudou: criada com ele, ele entrou ou saiu,
 * ou excluída com ele dentro. Mudanças da equipe que não mexem nele ficam de fora.
 */
const mudouNaEquipe = (id: string) =>
  and(eq(e.entidade, 'equipe'), sql`${naEquipe(e.antes, id)} <> ${naEquipe(e.depois, id)}`) as SQL;

function doAlvo(alvo: AlvoHistorico): SQL {
  const proprio = (entidade: string) => and(eq(e.entidade, entidade), eq(e.entidadeId, alvo.id));
  if (alvo.cadastro === 'cliente') return proprio('cliente') as SQL;
  if (alvo.cadastro === 'exame') {
    // Valor fora do padrão: ligado ao exame hoje (tabela) ou em algum evento (inclusive apagado).
    // A quebra fica de fora: ela é do nome do estudo, não do id do exame, e o evento só guarda nomes.
    const deParaDoExame = sql`(${e.entidadeId} in (select id::text from exames_de_para_valores where exame_id::text = ${alvo.id}) or ${cita('exameId', alvo.id)})`;
    return or(proprio('exame'), and(eq(e.entidade, 'de_para_valor_exame'), deParaDoExame)) as SQL;
  }
  const { incluir } = alvo;
  const partes: SQL[] = [
    mudouNaEquipe(alvo.id),
    incluir.pagamento
      ? (proprio('medico') as SQL)
      : (and(
          proprio('medico'),
          sql`${e.acao} not in (${sql.join(
            ACOES_PAGAMENTO.map((a) => sql`${a}`),
            sql`, `,
          )})`,
        ) as SQL),
  ];
  if (incluir.distribuicao) {
    partes.push(
      and(
        inArray(e.entidade, ['medico_distribuicao', 'arranjos_medico']),
        eq(e.entidadeId, alvo.id),
      ) as SQL,
    );
  }
  if (incluir.acesso) {
    partes.push(
      and(
        eq(e.entidade, 'usuario'),
        inArray(e.acao, ACOES_ACESSO),
        cita('medicoId', alvo.id),
      ) as SQL,
    );
  }
  return or(...partes) as SQL;
}

type Json = Record<string, unknown> | null;

/** UUIDs citados em qualquer nível do JSON (os arranjos guardam listas de objetos com ids). */
function uuidsDe(valor: unknown, ids: Set<string>) {
  if (typeof valor === 'string') {
    if (UUID.test(valor)) ids.add(valor.toLowerCase());
  } else if (Array.isArray(valor)) {
    for (const v of valor) uuidsDe(v, ids);
  } else if (valor && typeof valor === 'object') {
    for (const v of Object.values(valor)) uuidsDe(v, ids);
  }
}

/** Tabelas cujos ids aparecem nos eventos dos cadastros, com a coluna do nome legível. */
const TABELAS_COM_NOME: Array<[tabela: string, coluna: string]> = [
  ['medicos', 'nome'],
  ['niveis_medico', 'nome'],
  ['equipes', 'nome'],
  ['usuarios', 'nome'],
  ['papeis', 'nome'],
  ['clientes', 'nome'],
  ['contratados', 'razao_social'],
  ['exames', 'nome'],
  ['modalidades', 'codigo'],
  ['especialidades', 'nome'],
  ['subespecialidades', 'nome'],
  ['categorias_exame', 'nome'],
  ['prioridades', 'nome'],
  // Arranjos: prioridades da operação desde 19/11/2026 (antes, do catálogo).
  ['prioridades_operacao', 'nome'],
];

@Injectable()
export class DrizzleHistoricoCadastroRepository implements HistoricoCadastroRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(alvo: AlvoHistorico, paginacao: Paginacao): Promise<PaginaHistoricoCadastro> {
    const onde = doAlvo(alvo);
    // Em série, não em paralelo: o pool de produção é pequeno (Supabase).
    const linhas = await this.db
      .select({
        id: e.id,
        ocorridoEm: e.ocorridoEm,
        atorTipo: e.atorTipo,
        atorNome: sql<string | null>`coalesce(${usuarios.nome}, ${chavesRobo.nome})`,
        entidade: e.entidade,
        entidadeId: e.entidadeId,
        acao: e.acao,
        antes: e.antes,
        depois: e.depois,
      })
      .from(e)
      .leftJoin(usuarios, and(eq(e.atorTipo, 'usuario'), eq(usuarios.id, e.atorId)))
      .leftJoin(chavesRobo, and(eq(e.atorTipo, 'robo'), eq(chavesRobo.id, e.atorId)))
      .where(onde)
      .orderBy(desc(e.ocorridoEm), desc(e.id))
      .limit(paginacao.porPagina)
      .offset((paginacao.pagina - 1) * paginacao.porPagina);
    const [contagem] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(e)
      .where(onde);

    const nomesDosEventos: Record<string, string> = {};
    const itens: ItemHistoricoCadastro[] = linhas.map((l) => {
      const item: ItemHistoricoCadastro = {
        id: l.id,
        ocorridoEm: l.ocorridoEm,
        ator: { tipo: l.atorTipo as ItemHistoricoCadastro['ator']['tipo'], nome: l.atorNome },
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        acao: l.acao,
        antes: l.antes as Json,
        depois: l.depois as Json,
      };
      if (item.entidade !== 'equipe' || alvo.cadastro !== 'medico') return item;
      // No médico, o evento da equipe vira "entrou", "saiu" ou "equipe excluída"; o resto da
      // equipe (outros membros, plantão) é da tela da equipe.
      const nome = (item.antes?.nome ?? item.depois?.nome) as string | undefined;
      if (nome) nomesDosEventos[item.entidadeId.toLowerCase()] = nome;
      const entrou = ((item.depois?.medicoIds ?? []) as string[]).includes(alvo.id);
      const acao =
        item.acao === 'excluido' ? 'equipe_excluida' : entrou ? 'membro_entrou' : 'membro_saiu';
      return { ...item, acao, antes: null, depois: null };
    });

    const ids = new Set<string>();
    for (const item of itens) {
      uuidsDe(item.antes, ids);
      uuidsDe(item.depois, ids);
      // Na aba Acesso, o evento é da conta, e o da equipe é dela: o nome vem pelo id do evento.
      if (item.entidade === 'usuario' || item.entidade === 'equipe') uuidsDe(item.entidadeId, ids);
      if (item.entidade === 'exame' || item.entidade === 'de_para_valor_exame') {
        uuidsDe(item.entidadeId, ids);
      }
    }
    // A equipe excluída não está mais na tabela: o nome vem do próprio evento.
    const nomes = { ...nomesDosEventos, ...(await this.nomes([...ids])) };
    return { itens, total: contagem?.total ?? 0, nomes };
  }

  /** Uma consulta só por página: cada tabela com os ids da página, numa união. */
  private async nomes(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const lista = sql`array[${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )}]::uuid[]`;
    const uniao = sql.join(
      TABELAS_COM_NOME.map(
        ([tabela, coluna]) =>
          sql`select id::text as id, ${sql.identifier(coluna)}::text as nome from ${sql.identifier(tabela)} where id = any(${lista})`,
      ),
      sql` union all `,
    );
    const resultado = await this.db.execute<{ id: string; nome: string }>(uniao);
    return Object.fromEntries(resultado.rows.map((r) => [r.id, r.nome]));
  }
}
