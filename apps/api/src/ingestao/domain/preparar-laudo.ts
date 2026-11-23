import { createHash } from 'node:crypto';

import { normalizarNome } from '../../catalogo/comum/nomes';
import { normalizarNomeMedico } from '../../medicos/comum/nome-medico';
import { classificarEstudo, type RetratoCatalogo, type TipoPendencia } from './classificar-estudo';
import { competenciaDoLaudo, diaBrasilia } from './competencia';
import { identidadeDoLaudo } from './identidade-laudo';
import type { LinhaLaudo } from './linha-planilha';
import { chaveEstudo } from './nome-estudo';

export type OrigemLaudo = 'normal' | 'compartilhamento';

type TipoDaImportacao = TipoPendencia | 'cliente' | 'medico' | 'prioridade';
/** `prioridade_operacao`: grafia sem de-para nas prioridades da operação, vista pela rodada. */
export type TipoAviso = TipoDaImportacao | 'prioridade_operacao';

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
  /** Pelo id da conta MobileMed primeiro; sem id, ou com id desconhecido, pelo nome. */
  resolverMedico: (nome: string | null, idMobilemed: number | null) => string | null;
}

export interface LaudoPreparado {
  identidade: string;
  hashConteudo: string;
  origem: OrigemLaudo;
  empresaOrigem: string;
  clienteId: string | null;
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
 * o nome normalizado. O texto cru só passa pelo HMAC; nunca é gravado no laudo.
 */
export function textoDoPaciente(p: {
  codigoPaciente?: string | null;
  nomePaciente?: string | null;
}): string {
  const codigo = p.codigoPaciente?.replace(/^0+(?=.)/, '');
  return codigo ? `codigo:${codigo}` : `nome:${normalizarNome(p.nomePaciente ?? '')}`;
}

/**
 * Prepara o laudo de uma linha lida: resolve os cadastros, classifica o estudo e calcula volume,
 * dia, competência, identidade e o hash do conteúdo (que diz se uma reimportação mudou o laudo).
 * O id da conta MobileMed dos médicos fica fora do hash (ver o fim da função).
 */
export function prepararLaudo(
  l: LinhaLaudo,
  origem: OrigemLaudo,
  cadastros: CadastrosIngestao,
  pseudonimo: (texto: string) => string,
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
    competencia: competenciaDoLaudo(l.dataRealizacao, l.dataLaudo),
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
      // caminhos. Quando o id muda o médico resolvido, o medicoId (no hash) já muda o hash.
      medicoIdMobilemed: l.medicoIdMobilemed,
      medicoReassinaturaIdMobilemed: l.medicoReassinaturaIdMobilemed,
    },
    pendencias,
    conferidos: conferidos.map(({ tipo, chave }) => ({ tipo, chave })),
  };
}
