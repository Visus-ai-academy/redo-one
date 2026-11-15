import { normalizarNome } from '../catalogo/comum/nomes';
import type {
  categoriasExame,
  clientes,
  clientesAliases,
  contratados,
  especialidades,
  especialidadesDePara,
  exames,
  examesDeParaValores,
  modalidades,
  prioridades,
  prioridadesDePara,
  regrasQuebraExame,
  subespecialidades,
  subespecialidadesEspecialidades,
  sufixosNomeCliente,
} from '../database/schema';
import { type Aviso, chaveTexto, digitos, idDoLegado, texto } from './comum';
import type { LegadoCatalogo } from './legado';

export interface CatalogoMigrado {
  tabelas: {
    modalidades: (typeof modalidades.$inferInsert)[];
    especialidades: (typeof especialidades.$inferInsert)[];
    subespecialidades: (typeof subespecialidades.$inferInsert)[];
    subespecialidadesEspecialidades: (typeof subespecialidadesEspecialidades.$inferInsert)[];
    categoriasExame: (typeof categoriasExame.$inferInsert)[];
    prioridades: (typeof prioridades.$inferInsert)[];
    prioridadesDePara: (typeof prioridadesDePara.$inferInsert)[];
    especialidadesDePara: (typeof especialidadesDePara.$inferInsert)[];
    exames: (typeof exames.$inferInsert)[];
    regrasQuebraExame: (typeof regrasQuebraExame.$inferInsert)[];
    examesDeParaValores: (typeof examesDeParaValores.$inferInsert)[];
    contratados: (typeof contratados.$inferInsert)[];
    clientes: (typeof clientes.$inferInsert & { id: string })[];
    clientesAliases: (typeof clientesAliases.$inferInsert)[];
    sufixosNomeCliente: (typeof sufixosNomeCliente.$inferInsert)[];
  };
  avisos: Aviso[];
}

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Casa texto livre com um cadastro sem diferenciar maiúsculas, espaços nem acentos. */
const chaveCadastro = (v: string | null | undefined) => semAcento(chaveTexto(v));

const TIPO_DE_PARA = {
  NORMALIZACAO: 'normalizacao',
  INVALIDA: 'invalida',
  ARRANJO: 'regiao_anatomica',
} as const;

/** Índice de um cadastro pelo nome, para trocar o texto do dashboards-one pelo id. */
function indice<T>(itens: T[], chave: (item: T) => string) {
  const mapa = new Map<string, T>();
  for (const item of itens) {
    const k = chave(item);
    if (k && !mapa.has(k)) mapa.set(k, item);
  }
  return mapa;
}

/**
 * Apelidos de cliente como o dashboards-one os aplica (`limparNomeClienteLegado`): exato e depois
 * prefixo, o padrão mais longo primeiro; vale o primeiro acerto. Devolve o nome-base ou o próprio.
 */
function nomeBase(nome: string, apelidos: LegadoCatalogo['clienteApelidos']): string {
  const upper = nome.trim().toUpperCase();
  const normalizado = upper.replace(/\s*_\s*/g, '_').replace(/\s+/g, ' ');
  for (const tipo of ['EXATO', 'PREFIXO']) {
    const doTipo = apelidos
      .filter((a) => a.ativo && a.tipo.toUpperCase() === tipo)
      .sort((a, b) => b.padrao.length - a.padrao.length);
    for (const a of doTipo) {
      const p = a.padrao.toUpperCase();
      const casa =
        tipo === 'EXATO'
          ? upper === p || normalizado === p
          : upper.startsWith(p) || normalizado.startsWith(p);
      if (casa) return (a.destino || nome).trim();
    }
  }
  return nome.trim();
}

export function mapearCatalogo(legado: LegadoCatalogo): CatalogoMigrado {
  const avisos: Aviso[] = [];
  const avisar = (tabela: string, item: string, motivo: string) =>
    avisos.push({ tabela, item, motivo });

  const lista = (tabela: string, item: LegadoCatalogo['modalidades'][number]) => ({
    id: idDoLegado(tabela, item.id),
    descricao: texto(item.descricao),
    cor: texto(item.cor),
    ordem: item.ordem,
    ativo: item.ativo,
  });

  const tabModalidades = legado.modalidades.map((m) => ({
    ...lista('modalidades', m),
    codigo: m.nome.trim(),
  }));
  const tabEspecialidades = legado.especialidades.map((e) => ({
    ...lista('especialidades', e),
    nome: e.nome.trim(),
  }));
  const tabSubespecialidades = legado.subespecialidades.map((s) => ({
    ...lista('subespecialidades', s),
    nome: s.nome.trim(),
  }));
  const tabCategorias = legado.categorias.map((c) => ({
    ...lista('categorias_exame', c),
    nome: c.nome.trim(),
  }));
  const urgentes = new Set(legado.prioridadesUrgentes.map(chaveCadastro));
  const tabPrioridades = legado.prioridades.map((p) => ({
    ...lista('prioridades', p),
    nome: p.nome.trim(),
    urgente: urgentes.has(chaveCadastro(p.nome)),
  }));

  const especialidadeIds = new Set(legado.especialidades.map((e) => e.id));
  const subespecialidadeIds = new Set(legado.subespecialidades.map((s) => s.id));
  const tabSubEsp = legado.subespecialidadesEspecialidades
    .filter(
      (l) =>
        especialidadeIds.has(l.especialidadeId) && subespecialidadeIds.has(l.subespecialidadeId),
    )
    .map((l) => ({
      subespecialidadeId: idDoLegado('subespecialidades', l.subespecialidadeId),
      especialidadeId: idDoLegado('especialidades', l.especialidadeId),
    }));

  const modalidadePorCodigo = indice(tabModalidades, (m) => chaveCadastro(m.codigo));
  const especialidadePorNome = indice(tabEspecialidades, (e) => chaveCadastro(e.nome));
  const subPorNome = indice(tabSubespecialidades, (s) => chaveCadastro(s.nome));
  const categoriaPorNome = indice(tabCategorias, (c) => chaveCadastro(c.nome));
  const prioridadePorNome = indice(tabPrioridades, (p) => chaveCadastro(p.nome));

  // De-paras de prioridade e de especialidade.
  const tabPrioridadesDePara: CatalogoMigrado['tabelas']['prioridadesDePara'] = [];
  const origensPrioridade = new Set<string>();
  for (const d of legado.prioridadesDePara) {
    const origem = d.prioridadeOriginal.trim();
    const destino = prioridadePorNome.get(chaveCadastro(d.nomeFinal));
    if (!destino) {
      avisar(
        'prioridades_de_para',
        origem,
        `Prioridade "${d.nomeFinal}" não existe: ficou de fora.`,
      );
      continue;
    }
    if (origensPrioridade.has(origem)) continue;
    origensPrioridade.add(origem);
    tabPrioridadesDePara.push({
      id: idDoLegado('prioridade_de_para', d.id),
      origem,
      prioridadeId: destino.id,
      ativo: d.ativo,
    });
  }

  const tabEspDePara: CatalogoMigrado['tabelas']['especialidadesDePara'] = [];
  const chavesEspDePara = new Set<string>();
  for (const r of legado.especialidadeRegras) {
    const tipo = TIPO_DE_PARA[r.tipo.toUpperCase() as keyof typeof TIPO_DE_PARA];
    if (!tipo) {
      avisar('especialidades_de_para', r.origem, `Tipo "${r.tipo}" desconhecido: ficou de fora.`);
      continue;
    }
    const maiusculas = r.origem.trim().replace(/\s+/g, ' ').toUpperCase();
    const origem = tipo === 'regiao_anatomica' ? semAcento(maiusculas) : maiusculas;
    let especialidadeId: string | null = null;
    if (tipo !== 'invalida') {
      const destino = especialidadePorNome.get(chaveCadastro(r.destino));
      if (!destino) {
        avisar(
          'especialidades_de_para',
          origem,
          `Especialidade "${r.destino ?? ''}" não existe: ficou de fora.`,
        );
        continue;
      }
      if (chaveCadastro(destino.nome) === semAcento(origem)) {
        avisar(
          'especialidades_de_para',
          origem,
          'Leva a especialidade a ela mesma: não precisa de de-para.',
        );
        continue;
      }
      especialidadeId = destino.id;
    }
    const chave = `${tipo}:${origem}`;
    if (chavesEspDePara.has(chave)) continue;
    chavesEspDePara.add(chave);
    tabEspDePara.push({
      id: idDoLegado('especialidade_regra', r.id),
      tipo,
      origem,
      especialidadeId,
      ativo: r.ativo,
      observacoes: texto(r.observacoes),
    });
  }

  // Exames: o texto de modalidade, especialidade, categoria... vira chave estrangeira.
  const tabExames = legado.exames.map((e) => {
    const nome = e.nome.trim();
    const resolver = <T extends { id?: string }>(
      rotulo: string,
      valor: string | null,
      mapa: Map<string, T>,
    ) => {
      if (!texto(valor)) return null;
      const achado = mapa.get(chaveCadastro(valor));
      if (!achado)
        avisar('exames', nome, `${rotulo} "${valor}" não existe no catálogo: ficou vazia.`);
      return achado?.id ?? null;
    };
    return {
      id: idDoLegado('exames', e.id),
      nome,
      chaveNormalizada: normalizarNome(nome),
      codigo: texto(e.codigoExame),
      descricao: texto(e.descricao),
      modalidadeId: resolver('Modalidade', e.modalidade, modalidadePorCodigo),
      especialidadeId: resolver('Especialidade', e.especialidade, especialidadePorNome),
      subespecialidadeId: resolver('Subespecialidade', e.subespecialidade, subPorNome),
      categoriaId: resolver('Categoria', e.categoria, categoriaPorNome),
      prioridadeId: resolver('Prioridade', e.prioridade, prioridadePorNome),
      permiteQuebra: e.permiteQuebra,
      exigeRevisaoManual: e.exigeRevisaoManual,
      ativo: e.ativo,
    };
  });

  // Regras de quebra: no dashboards-one ligam exames pelo nome (que não é único).
  const examesPorNome = new Map<string, typeof tabExames>();
  for (const e of tabExames) {
    const k = chaveTexto(e.nome);
    examesPorNome.set(k, [...(examesPorNome.get(k) ?? []), e]);
  }
  const tabRegras: CatalogoMigrado['tabelas']['regrasQuebraExame'] = [];
  const paresRegra = new Set<string>();
  for (const r of legado.regrasQuebra) {
    const origens = examesPorNome.get(chaveTexto(r.exameOriginal)) ?? [];
    const destinos = examesPorNome.get(chaveTexto(r.exameQuebrado)) ?? [];
    if (origens.length === 0 || destinos.length === 0) {
      avisar(
        'regras_quebra_exame',
        `${r.exameOriginal} → ${r.exameQuebrado}`,
        `Exame "${origens.length === 0 ? r.exameOriginal : r.exameQuebrado}" não existe: ficou de fora.`,
      );
      continue;
    }
    const categoria = texto(r.categoriaQuebrada)
      ? categoriaPorNome.get(chaveCadastro(r.categoriaQuebrada))
      : undefined;
    if (texto(r.categoriaQuebrada) && !categoria) {
      avisar(
        'regras_quebra_exame',
        `${r.exameOriginal} → ${r.exameQuebrado}`,
        `Categoria "${r.categoriaQuebrada}" não existe: ficou vazia.`,
      );
    }
    // Homônimos: a regra vale para cada exame com o nome de origem, quebrando no da mesma modalidade.
    origens.forEach((origem, i) => {
      const destino =
        destinos.find((d) => d.modalidadeId === origem.modalidadeId && d.id !== origem.id) ??
        destinos.find((d) => d.id !== origem.id);
      if (!destino) return;
      if (destinos.length > 1 && i === 0) {
        avisar(
          'regras_quebra_exame',
          `${r.exameOriginal} → ${r.exameQuebrado}`,
          `Há ${destinos.length} exames chamados "${r.exameQuebrado}": usado o da mesma modalidade.`,
        );
      }
      const par = `${origem.id}:${destino.id}`;
      if (paresRegra.has(par)) return;
      paresRegra.add(par);
      tabRegras.push({
        id: idDoLegado('regras_quebra_exames', i === 0 ? r.id : `${r.id}:${origem.id}`),
        exameOrigemId: origem.id,
        exameDestinoId: destino.id,
        categoriaId: categoria?.id ?? null,
        ativo: r.ativo,
      });
    });
  }

  // Valores de exame fora do padrão: a chave normalizada é única no redo-one.
  const exameIds = new Set(legado.exames.map((e) => e.id));
  const tabValores: CatalogoMigrado['tabelas']['examesDeParaValores'] = [];
  const chavesValores = new Map<string, number>();
  for (const v of [...legado.examesForaPadrao].sort((a, b) => Number(b.ativo) - Number(a.ativo))) {
    const estudoDescricao = v.estudoDescricao.trim();
    const chave = normalizarNome(estudoDescricao);
    if (!chave) continue;
    if (chavesValores.has(chave)) {
      avisar(
        'exames_de_para_valores',
        estudoDescricao,
        'Grafia repetida no dashboards-one: ficou só a primeira (a ativa, se houver).',
      );
      continue;
    }
    chavesValores.set(chave, tabValores.length);
    tabValores.push({
      id: idDoLegado('exames_fora_padrao', v.id),
      estudoDescricao,
      chaveNormalizada: chave,
      valores: Number(v.valores),
      exameId: v.exameId && exameIds.has(v.exameId) ? idDoLegado('exames', v.exameId) : null,
      ativo: v.ativo,
    });
  }

  // Contratados.
  const contratadoIds = new Set(legado.contratados.map((c) => c.id));
  const tabContratados = legado.contratados.map((c) => ({
    id: idDoLegado('contratados', c.id),
    razaoSocial: c.razaoSocial.trim(),
    cnpj: digitos(c.cnpj, 14),
    endereco: texto(c.endereco),
    cidade: texto(c.cidade),
    uf: texto(c.uf)?.toUpperCase() ?? null,
    cep: digitos(c.cep, 8),
    contratadoRepasseId:
      c.contratadoRepasseId && contratadoIds.has(c.contratadoRepasseId)
        ? idDoLegado('contratados', c.contratadoRepasseId)
        : null,
    ativo: c.ativo,
  }));

  // Clientes.
  const ocultos = new Set(legado.clientesOcultos.map((e) => chaveTexto(e)));
  const tabClientes: CatalogoMigrado['tabelas']['clientes'] = legado.clientes.map((c) => {
    const nome = c.nome.trim();
    const tipoPessoa = c.tipoPessoa?.trim().toUpperCase();
    // Pessoa física cadastrada com o CPF no campo CNPJ.
    const cpfNoCnpj = !c.cpf && digitos(c.cnpj, 11);
    if (cpfNoCnpj) {
      avisar(
        'clientes',
        nome,
        'O campo CNPJ tinha um CPF (11 dígitos): foi para o CPF, como pessoa física.',
      );
    } else if (texto(c.cnpj) && !digitos(c.cnpj, 14))
      avisar('clientes', nome, `CNPJ "${c.cnpj}" sem 14 dígitos: ficou vazio.`);
    if (texto(c.cpf) && !digitos(c.cpf, 11))
      avisar('clientes', nome, 'CPF sem 11 dígitos: ficou vazio.');
    return {
      id: idDoLegado('clientes', c.id),
      nome,
      chaveNormalizada: normalizarNome(nome),
      nomeFantasia: texto(c.nomeFantasia),
      razaoSocial: texto(c.razaoSocial),
      tipoPessoa: cpfNoCnpj ? 'PF' : tipoPessoa === 'PJ' || tipoPessoa === 'PF' ? tipoPessoa : null,
      cnpj: digitos(c.cnpj, 14),
      cpf: cpfNoCnpj || digitos(c.cpf, 11),
      contratadoId:
        c.contratadoId && contratadoIds.has(c.contratadoId)
          ? idDoLegado('contratados', c.contratadoId)
          : null,
      unificadoEmId: null,
      ativo: c.ativo,
      ocultoDashboards: ocultos.has(chaveTexto(nome)),
      observacoes: texto(c.observacoes),
    };
  });
  const clientePorChave = new Map<string, (typeof tabClientes)[number]>();
  for (const c of tabClientes)
    if (!clientePorChave.has(c.chaveNormalizada)) clientePorChave.set(c.chaveNormalizada, c);

  // Apelidos exato/prefixo: o destino é um nome-base. Se for um cliente, o apelido vai para ele;
  // se juntar várias unidades (PRN, CEDIDIAG), nasce o cliente principal e elas viram unidades.
  const apelidosAtivos = legado.clienteApelidos.filter((a) => {
    if (!a.ativo)
      avisar('clientes_aliases', a.padrao, 'Apelido inativo no dashboards-one: ficou de fora.');
    return a.ativo;
  });
  const destinoDoApelido = new Map<string, (typeof tabClientes)[number] | null>();
  const resolverDestino = (destino: string) => {
    const chave = normalizarNome(destino);
    if (destinoDoApelido.has(chave)) return destinoDoApelido.get(chave) ?? null;
    let alvo = clientePorChave.get(chave) ?? null;
    if (!alvo) {
      const unidades = tabClientes.filter(
        (c) =>
          !c.unificadoEmId &&
          (normalizarNome(nomeBase(c.nome, apelidosAtivos)) === chave ||
            normalizarNome(c.nomeFantasia ?? '') === chave),
      );
      if (unidades.length === 1) alvo = unidades[0] ?? null;
      if (unidades.length > 1) {
        const comum = <K extends 'razaoSocial' | 'cnpj' | 'tipoPessoa' | 'contratadoId'>(k: K) => {
          const valores = new Set(unidades.map((u) => u[k]).filter((v) => v != null));
          return valores.size === 1 ? ([...valores][0] as (typeof unidades)[number][K]) : null;
        };
        const principal: (typeof tabClientes)[number] = {
          id: idDoLegado('clientes-principal', chave),
          nome: destino.trim(),
          chaveNormalizada: chave,
          nomeFantasia: destino.trim(),
          razaoSocial: comum('razaoSocial'),
          tipoPessoa: comum('tipoPessoa'),
          cnpj: comum('cnpj'),
          cpf: null,
          contratadoId: comum('contratadoId'),
          unificadoEmId: null,
          ativo: unidades.some((u) => u.ativo),
          ocultoDashboards: false,
          observacoes: `Cliente principal criado na migração do dashboards-one: une as ${unidades.length} unidades que os apelidos levavam a "${destino.trim()}".`,
        };
        for (const u of unidades) u.unificadoEmId = principal.id;
        tabClientes.push(principal);
        clientePorChave.set(chave, principal);
        alvo = principal;
      }
    }
    destinoDoApelido.set(chave, alvo);
    return alvo;
  };

  const tabAliases: CatalogoMigrado['tabelas']['clientesAliases'] = [];
  const chavesAlias = new Set<string>();
  const adicionarAlias = (alias: CatalogoMigrado['tabelas']['clientesAliases'][number]) => {
    const k = `${alias.tipo}:${alias.chave}`;
    if (chavesAlias.has(k)) return;
    chavesAlias.add(k);
    tabAliases.push(alias);
  };
  const tabSufixos: CatalogoMigrado['tabelas']['sufixosNomeCliente'] = [];
  for (const a of apelidosAtivos) {
    const padrao = a.padrao.trim();
    const tipo = a.tipo.toUpperCase();
    if (tipo === 'SUFIXO') {
      if (texto(a.destino))
        avisar(
          'sufixos_nome_cliente',
          padrao,
          `O sufixo trocava por "${a.destino}"; no redo-one o sufixo só corta.`,
        );
      if (!tabSufixos.some((s) => s.sufixo.toUpperCase() === padrao.toUpperCase())) {
        tabSufixos.push({
          id: idDoLegado('cliente_apelidos', a.id),
          sufixo: padrao,
          ativo: a.ativo,
          observacoes: texto(a.observacoes),
        });
      }
      continue;
    }
    if (tipo !== 'EXATO' && tipo !== 'PREFIXO') {
      avisar('clientes_aliases', padrao, `Tipo "${a.tipo}" desconhecido: ficou de fora.`);
      continue;
    }
    const alvo = resolverDestino(texto(a.destino) ?? padrao);
    if (!alvo) {
      avisar(
        'clientes_aliases',
        padrao,
        `Nenhum cliente com o nome "${a.destino}": ficou de fora.`,
      );
      continue;
    }
    if (tipo === 'EXATO' && chaveTexto(alvo.nome) === chaveTexto(padrao)) continue;
    adicionarAlias({
      id: idDoLegado('cliente_apelidos', a.id),
      clienteId: alvo.id,
      tipo: tipo === 'EXATO' ? 'exato' : 'prefixo',
      padrao,
      chave: padrao.toUpperCase(),
      observacoes: texto(a.observacoes),
    });
  }

  // Grafias normalizadas (`cliente_nome_aliases`): o nome do cliente vence a grafia; a grafia de
  // várias unidades do mesmo principal vai para o principal; nos outros casos de grafia de vários
  // clientes, vence a primeira lida, como no resolvedor do dashboards-one.
  const clientePorIdLegado = new Map(legado.clientes.map((c, i) => [c.id, tabClientes[i]]));
  const porChave = new Map<string, LegadoCatalogo['clienteNomeAliases']>();
  for (const a of legado.clienteNomeAliases) {
    const chave = normalizarNome(a.nomeOrigem);
    if (!chave) continue;
    porChave.set(chave, [...(porChave.get(chave) ?? []), a]);
  }
  for (const [chave, grupo] of porChave) {
    const dono = clientePorChave.get(chave);
    const primeiro = grupo[0];
    if (!primeiro) continue;
    if (dono) {
      const outros = grupo.filter((a) => {
        const c = clientePorIdLegado.get(a.clienteId);
        return c && c.id !== dono.id && c.unificadoEmId !== dono.id;
      });
      if (outros.length > 0) {
        avisar(
          'clientes_aliases',
          primeiro.nomeOrigem,
          `A grafia é o nome do cliente ${dono.nome}: o apelido de outro cliente não valia e ficou de fora.`,
        );
      }
      continue;
    }
    const alvos = [
      ...new Map(
        grupo
          .map((a) => clientePorIdLegado.get(a.clienteId))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => {
            const final = c.unificadoEmId
              ? (tabClientes.find((p) => p.id === c.unificadoEmId) ?? c)
              : c;
            return [final.id, final] as const;
          }),
      ).values(),
    ];
    const alvo = alvos[0];
    if (!alvo) continue;
    if (alvos.length > 1) {
      avisar(
        'clientes_aliases',
        primeiro.nomeOrigem,
        `A grafia aponta para ${alvos.length} clientes; ficou com ${alvo.nome}, o primeiro, como no dashboards-one.`,
      );
    }
    adicionarAlias({
      id: idDoLegado('cliente_nome_aliases', primeiro.id),
      clienteId: alvo.id,
      tipo: 'normalizado',
      padrao: primeiro.nomeOrigem.trim(),
      chave,
      observacoes: texto(primeiro.observacoes),
    });
  }

  return {
    tabelas: {
      modalidades: tabModalidades,
      especialidades: tabEspecialidades,
      subespecialidades: tabSubespecialidades,
      subespecialidadesEspecialidades: tabSubEsp,
      categoriasExame: tabCategorias,
      prioridades: tabPrioridades,
      prioridadesDePara: tabPrioridadesDePara,
      especialidadesDePara: tabEspDePara,
      exames: tabExames,
      regrasQuebraExame: tabRegras,
      examesDeParaValores: tabValores,
      contratados: tabContratados,
      clientes: tabClientes,
      clientesAliases: tabAliases,
      sufixosNomeCliente: tabSufixos,
    },
    avisos,
  };
}
