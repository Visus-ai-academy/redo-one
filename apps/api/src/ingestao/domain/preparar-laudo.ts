import { createHash } from 'node:crypto';

import { normalizarNome } from '../../catalogo/comum/nomes';
import { normalizarNomeMedico } from '../../medicos/comum/nome-medico';
import { classificarEstudo, type RetratoCatalogo, type TipoPendencia } from './classificar-estudo';
import {
  cadeiaDoCliente,
  competenciaPelaCadeia,
  diaBrasilia,
  type TabelaCortes,
} from './competencia';
import { identidadeDoLaudo } from './identidade-laudo';
import type { LinhaLaudo } from './linha-planilha';
import { chaveEstudo } from './nome-estudo';

export type OrigemLaudo = 'normal' | 'compartilhamento';

type TipoDaImportacao = TipoPendencia | 'cliente' | 'medico' | 'prioridade';
/**
 * Vistos pela rodada da distribuição: `prioridade_operacao` (grafia sem de-para nas prioridades da
 * operação) e `conta_unidade` (médico escalado sem conta liberada na unidade do exame na MobileMed).
 */
export type TipoAviso = TipoDaImportacao | 'prioridade_operacao' | 'conta_unidade';

/** Cadastro que faltou, com a chave normalizada que identifica o aviso. */
export interface PendenciaCadastro {
  tipo: TipoAviso;
  chave: string;
  valor: string;
}

export interface CadastrosIngestao {
  catalogo: RetratoCatalogo;
  /** `normalizarNome` do nome da prioridade ou da variação → id. */
  prioridades: ReadonlyMap<string, string>;
  resolverCliente: (empresa: string) => string | null;
  /** A unidade (`clientes.unificado_em_id`) com que a empresa casou; nulo se não é unidade. */
  resolverUnidade: (empresa: string) => string | null;
  /** Pelo id da conta MobileMed primeiro; sem id, ou com id desconhecido, pelo nome. */
  resolverMedico: (nome: string | null, idMobilemed: number | null) => string | null;
}

/**
 * Nome e código do paciente como chegaram da MobileMed, gravados à parte do laudo
 * (`laudos_pacientes`, leitura só com permissão e auditada). Fora do hash do conteúdo: a
 * `conferencia` (HMAC dos dois) é que diz se a reimportação tem de regravá-los.
 */
export interface PacienteDoLaudo {
  nome: string | null; // LGPD: saúde
  codigo: string | null; // LGPD: saúde
  conferencia: string;
}

export interface LaudoPreparado {
  identidade: string;
  hashConteudo: string;
  origem: OrigemLaudo;
  empresaOrigem: string;
  clienteId: string | null;
  unidadeId: string | null;
  accessionNumber: string | null;
  pacienteChave: string;
  estudo: string;
  exameId: string | null;
  modalidadeOrigem: string;
  modalidadeId: string | null;
  especialidadeOrigem: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
  prioridadeOrigem: string;
  prioridadeId: string | null;
  medicoOrigem: string | null;
  medicoId: string | null;
  medicoReassinaturaOrigem: string | null;
  medicoReassinaturaId: string | null;
  /** Conta MobileMed de quem assinou (só a importação pela API traz); fora do hash. */
  medicoIdMobilemed: number | null;
  medicoReassinaturaIdMobilemed: number | null;
  valores: number | null;
  volume: number;
  status: string;
  duplicado: boolean;
  complementar: boolean;
  dataRealizacao: Date;
  dataTransferencia: Date | null;
  dataLaudo: Date;
  dataPrazo: Date | null;
  dataReassinatura: Date | null;
  diaLaudo: string;
  competencia: string;
  pecas: { exameId: string; categoriaId: string | null }[];
  /** Nulo quando a linha não traz nem nome nem código. */
  paciente: PacienteDoLaudo | null;
}

const CHAVE_DO_AVISO: Record<TipoDaImportacao, (valor: string) => string> = {
  cliente: normalizarNome,
  medico: normalizarNomeMedico,
  estudo: chaveEstudo,
  modalidade: normalizarNome,
  especialidade: normalizarNome,
  prioridade: normalizarNome,
};

const comChave = (tipo: TipoDaImportacao, valor: string): PendenciaCadastro => ({
  tipo,
  chave: CHAVE_DO_AVISO[tipo](valor),
  valor,
});

/**
 * Pseudônimo do paciente: o código sem zeros à esquerda (como a MobileMed compara) ou, sem código,
 * o nome normalizado. O texto cru só passa pelo HMAC; no laudo fica só o pseudônimo (o nome e o
 * código vão para `laudos_pacientes`, ver `PacienteDoLaudo`).
 */
export function textoDoPaciente(p: {
  codigoPaciente?: string | null;
  nomePaciente?: string | null;
}): string {
  const codigo = p.codigoPaciente?.replace(/^0+(?=.)/, '');
  return codigo ? `codigo:${codigo}` : `nome:${normalizarNome(p.nomePaciente ?? '')}`;
}

function pacienteDoLaudo(
  l: LinhaLaudo,
  pseudonimo: (texto: string) => string,
): PacienteDoLaudo | null {
  if (!l.nomePaciente && !l.codigoPaciente) return null;
  return {
    nome: l.nomePaciente,
    codigo: l.codigoPaciente,
    conferencia: pseudonimo(`paciente:${JSON.stringify([l.nomePaciente, l.codigoPaciente])}`),
  };
}

/**
 * Prepara o laudo de uma linha lida: resolve os cadastros, classifica o estudo e calcula volume,
 * dia, competência, identidade e o hash do conteúdo (que diz se uma reimportação mudou o laudo).
 * O id da conta MobileMed dos médicos e o paciente ficam fora do hash (ver o fim da função).
 */
export function prepararLaudo(
  l: LinhaLaudo,
  origem: OrigemLaudo,
  cadastros: CadastrosIngestao,
  pseudonimo: (texto: string) => string,
  cortes: TabelaCortes,
): {
  laudo: LaudoPreparado;
  pendencias: PendenciaCadastro[];
  conferidos: Omit<PendenciaCadastro, 'valor'>[];
} {
  const pendencias: PendenciaCadastro[] = [];
  const conferidos: PendenciaCadastro[] = [];
  const conferir = (tipo: TipoDaImportacao, valor: string, id: string | null) => {
    (id ? conferidos : pendencias).push(comChave(tipo, valor));
    return id;
  };

  const estudo = classificarEstudo(l, cadastros.catalogo);
  pendencias.push(...estudo.pendencias.map((p) => comChave(p.tipo, p.valor)));
  conferidos.push(...estudo.conferidos.map((p) => comChave(p.tipo, p.valor)));

  const clienteId = conferir('cliente', l.empresa, cadastros.resolverCliente(l.empresa));
  const prioridadeId = conferir(
    'prioridade',
    l.prioridade,
    cadastros.prioridades.get(normalizarNome(l.prioridade)) ?? null,
  );
  // O aviso é pelo nome (o mesmo médico pelo upload e pela API é um aviso só); o valor diz
  // quando a conta MobileMed veio e não está em nenhum cadastro.
  const resolverMedico = (nome: string | null, idMobilemed: number | null) => {
    const id = cadastros.resolverMedico(nome, idMobilemed);
    if (!nome) return id;
    const aviso = comChave('medico', nome);
    if (id) conferidos.push(aviso);
    else {
      pendencias.push(
        idMobilemed
          ? { ...aviso, valor: `${nome} (ID MobileMed ${idMobilemed} sem cadastro)` }
          : aviso,
      );
    }
    return id;
  };
  const medicoId = resolverMedico(l.medico, l.medicoIdMobilemed);
  const medicoReassinaturaId = resolverMedico(
    l.medicoReassinatura,
    l.medicoReassinaturaIdMobilemed,
  );

  const pacienteChave = pseudonimo(textoDoPaciente(l));
  const conteudo = {
    origem,
    empresaOrigem: l.empresa,
    clienteId,
    unidadeId: clienteId ? cadastros.resolverUnidade(l.empresa) : null,
    accessionNumber: l.accessionNumber,
    pacienteChave,
    estudo: l.estudo,
    exameId: estudo.exameId,
    modalidadeOrigem: l.modalidade,
    modalidadeId: estudo.modalidadeId,
    especialidadeOrigem: l.especialidade || null,
    especialidadeId: estudo.especialidadeId,
    categoriaId: estudo.categoriaId,
    prioridadeOrigem: l.prioridade,
    prioridadeId,
    medicoOrigem: l.medico,
    medicoId,
    medicoReassinaturaOrigem: l.medicoReassinatura,
    medicoReassinaturaId,
    valores: l.valores,
    volume: estudo.volume,
    status: l.status,
    duplicado: l.duplicado,
    complementar: l.complementar,
    dataRealizacao: l.dataRealizacao,
    dataTransferencia: l.dataTransferencia,
    dataLaudo: l.dataLaudo,
    dataPrazo: l.dataPrazo,
    dataReassinatura: l.dataReassinatura,
    diaLaudo: diaBrasilia(l.dataLaudo),
    competencia: competenciaPelaCadeia(
      l.dataRealizacao,
      l.dataLaudo,
      cadeiaDoCliente(cortes, clienteId),
    ),
    pecas: estudo.pecas,
  };

  return {
    laudo: {
      identidade: identidadeDoLaudo({
        empresa: l.empresa,
        accessionNumber: l.accessionNumber,
        pacienteChave,
        estudo: l.estudo,
        realizacao: l.dataRealizacao,
        laudo: l.dataLaudo,
      }),
      hashConteudo: createHash('sha256').update(JSON.stringify(conteudo)).digest('hex'),
      ...conteudo,
      // Fora do hash: o upload não traz o id, e o mesmo laudo tem de dar o mesmo hash pelos dois
      // caminhos. Quando o id muda o médico resolvido, o medicoId (no hash) já muda o hash; no
      // laudo igual, o plano (`idsMedico`) grava o id que falta ou mudou.
      medicoIdMobilemed: l.medicoIdMobilemed,
      medicoReassinaturaIdMobilemed: l.medicoReassinaturaIdMobilemed,
      paciente: pacienteDoLaudo(l, pseudonimo),
    },
    pendencias,
    conferidos: conferidos.map(({ tipo, chave }) => ({ tipo, chave })),
  };
}
