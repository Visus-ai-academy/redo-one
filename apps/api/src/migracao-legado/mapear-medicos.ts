import type {
  equipes,
  equipesMembros,
  medicos,
  medicosAliases,
  medicosDadosPagamento,
} from '../database/schema';
import { normalizarNomeMedico } from '../medicos/comum/nome-medico';
import { type Aviso, digitos, idDoLegado, simNao, texto } from './comum';
import type { LegadoMedicos } from './legado';

export interface MedicosMigrados {
  tabelas: {
    medicos: (typeof medicos.$inferInsert)[];
    medicosDadosPagamento: (typeof medicosDadosPagamento.$inferInsert)[];
    medicosAliases: (typeof medicosAliases.$inferInsert)[];
    equipes: (typeof equipes.$inferInsert)[];
    equipesMembros: (typeof equipesMembros.$inferInsert)[];
  };
  avisos: Aviso[];
}

/**
 * No dashboards-one o médico oculto dos painéis era um nome cravado no código
 * (`filtrosOcultos.ts`, casado por "contém", sem diferenciar maiúsculas). No redo-one é a coluna
 * `oculto_dashboards`, editável no cadastro; a migração só traduz o que estava lá.
 */
const MEDICO_OCULTO_NO_LEGADO = 'rodrigo vaz de lima';

const FUNCOES = new Set(['STAFF', 'FELLOW']);
const TIPOS_PIX = new Set(['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA']);
const ORIGENS_ALIAS = new Set(['manual', 'volumetria', 'repasse', 'repasse_upload']);

export function mapearMedicos(legado: LegadoMedicos): MedicosMigrados {
  const avisos: Aviso[] = [];
  const avisar = (tabela: string, item: string, motivo: string) =>
    avisos.push({ tabela, item, motivo });

  const tabMedicos: MedicosMigrados['tabelas']['medicos'] = [];
  const tabPagamento: MedicosMigrados['tabelas']['medicosDadosPagamento'] = [];
  const chaves = new Map<string, string>();
  const migrados = new Set<string>();

  for (const m of legado.medicos) {
    const nome = m.nome.trim();
    const chave = normalizarNomeMedico(nome);
    if (!chave) {
      avisar('medicos', nome, 'Nome sem letras: ficou de fora.');
      continue;
    }
    const outro = chaves.get(chave);
    if (outro) {
      avisar('medicos', nome, `Mesmo nome normalizado de ${outro}: ficou de fora.`);
      continue;
    }
    chaves.set(chave, nome);
    migrados.add(m.id);

    const funcao = texto(m.funcao)?.toUpperCase() ?? null;
    if (funcao && !FUNCOES.has(funcao)) {
      avisar('medicos', nome, `Função "${m.funcao}" não é STAFF nem FELLOW: ficou vazia.`);
    }
    if (texto(m.nivel)) {
      avisar('medicos', nome, `Nível "${m.nivel}" não existe no catálogo de níveis: ficou vazio.`);
    }
    const id = idDoLegado('medicos', m.id);
    tabMedicos.push({
      id,
      nome,
      chaveNormalizada: chave,
      crm: texto(m.crm),
      idMobilemed: m.idMobilemed,
      email: texto(m.email)?.toLowerCase() ?? null,
      telefone: texto(m.telefone),
      ativo: m.ativo,
      ocultoDashboards: nome.toLowerCase().includes(MEDICO_OCULTO_NO_LEGADO),
      senior: m.senior,
      fellowship: m.fellowship,
      funcao: funcao && FUNCOES.has(funcao) ? (funcao as 'STAFF' | 'FELLOW') : null,
      nivelId: null,
      dataInicioVinculo: m.dataInicioVinculo,
      observacoes: texto(m.observacoes),
    });

    if (texto(m.cpf) && !digitos(m.cpf, 11))
      avisar('medicos_dados_pagamento', nome, 'CPF sem 11 dígitos: ficou vazio.');
    if (texto(m.cnpj) && !digitos(m.cnpj, 14))
      avisar('medicos_dados_pagamento', nome, 'CNPJ sem 14 dígitos: ficou vazio.');
    const tipoPix = texto(m.tipoChavePix)?.toUpperCase() ?? null;
    if (tipoPix && !TIPOS_PIX.has(tipoPix))
      avisar(
        'medicos_dados_pagamento',
        nome,
        `Tipo de chave Pix "${m.tipoChavePix}" desconhecido: ficou vazio.`,
      );
    const pagamento = {
      medicoId: id,
      cpf: digitos(m.cpf, 11),
      cnpj: digitos(m.cnpj, 14),
      razaoSocial: texto(m.nomeEmpresa),
      tipoChavePix:
        tipoPix && TIPOS_PIX.has(tipoPix)
          ? (tipoPix as 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA')
          : null,
      chavePix: texto(m.chavePix),
      socio: simNao(m.socio),
      optanteSimples: simNao(m.optanteSimples),
      omieCodigoFornecedor: texto(m.omieCodigoFornecedor),
    };
    const { medicoId: _, ...dados } = pagamento;
    if (Object.values(dados).some((v) => v !== null)) tabPagamento.push(pagamento);
  }

  // Apelidos: a grafia aponta um médico só, e não pode ser o nome normalizado de um médico.
  const tabAliases: MedicosMigrados['tabelas']['medicosAliases'] = [];
  const chavesAlias = new Set<string>();
  const nomePorIdLegado = new Map(legado.medicos.map((m) => [m.id, m.nome.trim()]));
  for (const a of legado.aliases) {
    if (!migrados.has(a.medicoId)) continue;
    const chave = normalizarNomeMedico(a.nomeOrigem);
    if (!chave || chavesAlias.has(chave)) continue;
    const dono = chaves.get(chave);
    if (dono) {
      if (dono !== nomePorIdLegado.get(a.medicoId)) {
        avisar('medicos_aliases', a.nomeOrigem, `A grafia é o nome de ${dono}: ficou de fora.`);
      }
      continue;
    }
    const origem = a.tipoOrigem.trim().toLowerCase();
    if (!ORIGENS_ALIAS.has(origem))
      avisar(
        'medicos_aliases',
        a.nomeOrigem,
        `Origem "${a.tipoOrigem}" desconhecida: ficou como manual.`,
      );
    chavesAlias.add(chave);
    tabAliases.push({
      id: idDoLegado('medico_nome_aliases', a.id),
      medicoId: idDoLegado('medicos', a.medicoId),
      nomeOrigem: a.nomeOrigem.trim(),
      chaveNormalizada: chave,
      origem: ORIGENS_ALIAS.has(origem)
        ? (origem as 'manual' | 'volumetria' | 'repasse' | 'repasse_upload')
        : 'manual',
      verificadoManualmente: a.verificadoManualmente,
      observacoes: texto(a.observacoes),
    });
  }

  const tabEquipes = legado.equipes.map((e) => ({
    id: idDoLegado('equipes', e.id),
    nome: e.nome.trim(),
    plantao: e.plantao,
    descricao: texto(e.descricao),
    cor: texto(e.cor),
    ordem: e.ordem,
    ativo: e.ativo,
  }));
  const equipeIds = new Set(legado.equipes.map((e) => e.id));
  const pares = new Set<string>();
  const tabMembros = legado.equipesMembros
    .filter((m) => equipeIds.has(m.equipeId) && migrados.has(m.medicoId))
    .filter((m) => {
      const par = `${m.equipeId}:${m.medicoId}`;
      if (pares.has(par)) return false;
      pares.add(par);
      return true;
    })
    .map((m) => ({
      equipeId: idDoLegado('equipes', m.equipeId),
      medicoId: idDoLegado('medicos', m.medicoId),
    }));

  return {
    tabelas: {
      medicos: tabMedicos,
      medicosDadosPagamento: tabPagamento,
      medicosAliases: tabAliases,
      equipes: tabEquipes,
      equipesMembros: tabMembros,
    },
    avisos,
  };
}
