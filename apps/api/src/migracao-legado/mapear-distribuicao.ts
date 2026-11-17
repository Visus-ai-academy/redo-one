import type {
  arranjos,
  arranjosClientes,
  arranjosClientesExclusivos,
  arranjosExames,
  arranjosModalidades,
  arranjosPrioridades,
  arranjosSubespecialidades,
  medicosDistribuicao,
} from '../database/schema';
import { type Aviso, idDoLegado, texto } from './comum';
import type { LegadoArranjo, LegadoCatalogo, LegadoDistribuicao } from './legado';
import { type CatalogoMigrado, chaveCadastro } from './mapear-catalogo';
import type { MedicosMigrados } from './mapear-medicos';

/** O que a distribuição precisa do resto da carga. */
export interface ContextoDistribuicao {
  legadoCatalogo: LegadoCatalogo;
  catalogo: CatalogoMigrado['tabelas'];
  medicos: MedicosMigrados['tabelas'];
}

type Linha<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export interface DistribuicaoMigrada {
  tabelas: {
    arranjos: (Linha<typeof arranjos> & { id: string })[];
    arranjosModalidades: Linha<typeof arranjosModalidades>[];
    arranjosSubespecialidades: Linha<typeof arranjosSubespecialidades>[];
    arranjosPrioridades: Linha<typeof arranjosPrioridades>[];
    arranjosClientes: Linha<typeof arranjosClientes>[];
    arranjosExames: Linha<typeof arranjosExames>[];
    arranjosClientesExclusivos: Linha<typeof arranjosClientesExclusivos>[];
    medicosDistribuicao: Linha<typeof medicosDistribuicao>[];
  };
  avisos: Aviso[];
  resumo: Record<string, number>;
}

/** Sentinela do dashboards-one para "exame sem subespecialidade". */
const SEM_SUBESPECIALIDADE = '(SEM SUBESPECIALIDADE)';

/** Decisão do usuário (16/11/2026): MAMO é MAMA. */
const ESPECIALIDADE_TROCADA: Record<string, string> = { MAMO: 'MAMA' };

/**
 * GERAL não existe no redo-one (15/11/2026). No dashboards-one o arranjo GERAL só casava exame
 * com especialidade GERAL, e nenhum exame do catálogo é GERAL: o arranjo não entregava nada (era o
 * arranjo que o cadastro exigia para salvar o médico). Fica de fora, com aviso.
 */
const SEM_EQUIVALENTE = new Set(['GERAL']);

const MODOS = new Set(['todos', 'apenas', 'exceto']);

export function mapearDistribuicao(
  legado: LegadoDistribuicao,
  ctx: ContextoDistribuicao,
): DistribuicaoMigrada {
  const avisos: Aviso[] = [];
  const resumo: Record<string, number> = {};
  const contar = (chave: string) => {
    resumo[chave] = (resumo[chave] ?? 0) + 1;
  };

  const c = ctx.catalogo;
  const modalidadePorCodigo = new Map([
    ...c.modalidadesDePara.map((d) => [chaveCadastro(d.origem), d.modalidadeId] as const),
    ...c.modalidades.map((m) => [chaveCadastro(m.codigo), m.id as string] as const),
  ]);
  const especialidadePorNome = new Map(
    c.especialidades.map((e) => [chaveCadastro(e.nome), e.id as string]),
  );
  const especialidadeDaGrafia = new Map(
    c.especialidadesDePara
      .filter((d) => d.tipo === 'normalizacao' && d.especialidadeId)
      .map((d) => [chaveCadastro(d.origem), d.especialidadeId as string]),
  );
  const subPorNome = new Map(
    c.subespecialidades.map((s) => [chaveCadastro(s.nome), s.id as string]),
  );
  const prioridadePorGrafia = new Map([
    ...c.prioridades.map((p) => [chaveCadastro(p.nome), p.id as string] as const),
    ...c.prioridadesDePara
      .filter((d) => d.ativo !== false)
      .map((d) => [chaveCadastro(d.origem), d.prioridadeId] as const),
  ]);
  const especialidadeLegada = new Map(ctx.legadoCatalogo.especialidades.map((e) => [e.id, e]));
  const clientesMigrados = new Set(c.clientes.map((x) => x.id));
  const examesMigrados = new Set(c.exames.map((x) => x.id as string));
  const medicosMigrados = new Set(ctx.medicos.medicos.map((m) => m.id as string));
  const equipesMigradas = new Set(ctx.medicos.equipes.map((e) => e.id as string));
  const nomeMedico = new Map(ctx.medicos.medicos.map((m) => [m.id as string, m.nome]));
  const nomeEquipe = new Map(ctx.medicos.equipes.map((e) => [e.id as string, e.nome]));

  const t: DistribuicaoMigrada['tabelas'] = {
    arranjos: [],
    arranjosModalidades: [],
    arranjosSubespecialidades: [],
    arranjosPrioridades: [],
    arranjosClientes: [],
    arranjosExames: [],
    arranjosClientesExclusivos: [],
    medicosDistribuicao: [],
  };

  /** Resolve um arranjo; null (com aviso) quando algum valor não existe no redo-one. */
  const mapearArranjo = (
    a: LegadoArranjo,
    tabela: string,
    dono: { medicoId: string | null; equipeId: string | null; rotulo: string },
    exclusivos: string[],
  ) => {
    const item = `${dono.rotulo} · ${especialidadeLegada.get(a.especialidadeId ?? '')?.nome.trim() ?? 'todas'}`;
    const sair = (motivo: string) => {
      avisos.push({ tabela: 'arranjos', item, motivo });
      contar('arranjosDescartados');
      return null;
    };
    const id = idDoLegado(tabela, a.id);

    // Especialidade (e a modalidade, quando a "especialidade" era frente de modalidade lá).
    let especialidadeId: string | null = null;
    const modalidades = [...a.modalidades];
    const esp = a.especialidadeId ? especialidadeLegada.get(a.especialidadeId) : undefined;
    if (a.especialidadeId && !esp) return sair('Especialidade não encontrada no dashboards-one.');
    if (esp) {
      const k = chaveCadastro(esp.nome);
      const codigo = texto(esp.modalidade);
      if (codigo) {
        modalidades.push(codigo);
      } else if (SEM_EQUIVALENTE.has(k)) {
        contar('arranjosGeral');
        return sair('Arranjo GERAL: só casava exame com especialidade GERAL, que não existe.');
      } else {
        const troca = ESPECIALIDADE_TROCADA[k];
        especialidadeId =
          especialidadePorNome.get(k) ??
          especialidadeDaGrafia.get(k) ??
          (troca ? especialidadePorNome.get(chaveCadastro(troca)) : undefined) ??
          null;
        if (!especialidadeId)
          return sair(`Especialidade "${esp.nome.trim()}" não existe no redo-one.`);
      }
    }

    // Em lista restrita, um valor desconhecido não pode simplesmente sumir: sumir alarga o recorte.
    const resolver = (valores: string[], mapa: Map<string, string>, eixo: string) => {
      const ids: string[] = [];
      for (const v of valores) {
        const achado = mapa.get(chaveCadastro(v));
        if (!achado) return `${eixo} "${v}" não existe no redo-one.`;
        if (!ids.includes(achado)) ids.push(achado);
      }
      return ids;
    };
    const modalidadeIds = resolver(modalidades, modalidadePorCodigo, 'Modalidade');
    if (typeof modalidadeIds === 'string') return sair(modalidadeIds);
    const geral = a.subespecialidades.some((s) => chaveCadastro(s) === SEM_SUBESPECIALIDADE);
    const subIds = resolver(
      a.subespecialidades.filter((s) => chaveCadastro(s) !== SEM_SUBESPECIALIDADE),
      subPorNome,
      'Segmento',
    );
    if (typeof subIds === 'string') return sair(subIds);
    const prioridadeIds = resolver(a.prioridades, prioridadePorGrafia, 'Prioridade');
    if (typeof prioridadeIds === 'string') return sair(prioridadeIds);

    const modo = (m: string) => (MODOS.has(m) ? (m as 'todos' | 'apenas' | 'exceto') : null);
    const modoClientes = modo(a.modoClientes);
    const modoExames = modo(a.modoExames);
    if (!modoClientes || !modoExames) return sair('Modo de clientes ou de exames desconhecido.');

    // Cliente ou exame que não migrou sai da lista, com aviso (dado depois de saber se o
    // arranjo fica: se ele cai, o aviso dele já diz tudo).
    const faltas: string[] = [];
    const migrados = (ids: string[], tabelaIds: string, existe: Set<string>, eixo: string) => {
      const ok = ids.map((x) => idDoLegado(tabelaIds, x)).filter((x) => existe.has(x));
      if (ok.length < ids.length) {
        faltas.push(`${ids.length - ok.length} ${eixo} não migrou e saiu da lista.`);
        contar(`${eixo}ForaDaLista`);
      }
      return [...new Set(ok)];
    };
    const clienteIds =
      modoClientes === 'todos' ? [] : migrados(a.clientes, 'clientes', clientesMigrados, 'cliente');
    const exameIds =
      modoExames === 'todos' ? [] : migrados(a.exames, 'exames', examesMigrados, 'exame');
    if (modoClientes === 'apenas' && !clienteIds.length)
      return sair('"Só estes clientes" ficou sem nenhum cliente: o arranjo ficou de fora.');
    if (modoExames === 'apenas' && !exameIds.length)
      return sair('"Só estes exames" ficou sem nenhum exame: o arranjo ficou de fora.');

    const atende = (cliente: string) =>
      modoClientes === 'todos' ||
      (modoClientes === 'apenas' ? clienteIds.includes(cliente) : !clienteIds.includes(cliente));
    const exclusivosMigrados = migrados(
      exclusivos,
      'clientes',
      clientesMigrados,
      'clínica exclusiva',
    );
    for (const motivo of faltas) avisos.push({ tabela: 'arranjos', item, motivo });
    const exclusivosOk = exclusivosMigrados.filter(atende);
    if (exclusivosOk.length < exclusivosMigrados.length) {
      avisos.push({
        tabela: 'arranjos',
        item,
        motivo: 'Clínica exclusiva que o próprio arranjo não atende: saiu das exclusivas.',
      });
      contar('exclusivasForaDoArranjo');
    }

    t.arranjos.push({
      id,
      medicoId: dono.medicoId,
      equipeId: dono.equipeId,
      especialidadeId,
      subespecialidadeGeral: geral,
      modoClientes,
      modoExames,
      ordem: a.ordem,
    });
    for (const modalidadeId of modalidadeIds)
      t.arranjosModalidades.push({ arranjoId: id, modalidadeId });
    for (const subespecialidadeId of subIds)
      t.arranjosSubespecialidades.push({ arranjoId: id, subespecialidadeId });
    for (const prioridadeId of prioridadeIds)
      t.arranjosPrioridades.push({ arranjoId: id, prioridadeId });
    for (const clienteId of clienteIds) t.arranjosClientes.push({ arranjoId: id, clienteId });
    for (const exameId of exameIds) t.arranjosExames.push({ arranjoId: id, exameId });
    for (const clienteId of exclusivosOk)
      t.arranjosClientesExclusivos.push({ arranjoId: id, clienteId });
    contar('arranjosMigrados');
    return id;
  };

  for (const a of legado.arranjosMedico) {
    const medicoId = idDoLegado('medicos', a.medicoId);
    if (!a.ativo || !medicosMigrados.has(medicoId)) continue;
    mapearArranjo(
      a,
      'medico_regras_distribuicao',
      { medicoId, equipeId: null, rotulo: nomeMedico.get(medicoId) ?? a.medicoId },
      a.clientesExclusivos,
    );
  }
  for (const a of legado.arranjosEquipe) {
    const equipeId = idDoLegado('equipes', a.equipeId);
    if (!a.ativo || !equipesMigradas.has(equipeId)) continue;
    mapearArranjo(
      a,
      'equipe_regras_distribuicao',
      { medicoId: null, equipeId, rotulo: nomeEquipe.get(equipeId) ?? a.equipeId },
      [],
    );
  }

  // O dashboards-one é a fonte: um registro por médico migrado, com o valor de lá.
  const habilitados = new Set(legado.habilitados.map((m) => idDoLegado('medicos', m)));
  for (const m of ctx.medicos.medicos) {
    t.medicosDistribuicao.push({
      medicoId: m.id as string,
      habilitadoRobo: habilitados.has(m.id as string),
    });
  }

  return { tabelas: t, avisos, resumo };
}
