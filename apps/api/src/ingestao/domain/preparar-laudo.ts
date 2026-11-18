import { createHash } from 'node:crypto';

import { normalizarNome } from '../../catalogo/comum/nomes';
import { normalizarNomeMedico } from '../../medicos/comum/nome-medico';
import { classificarEstudo, type RetratoCatalogo, type TipoPendencia } from './classificar-estudo';
import { competenciaDoLaudo, diaBrasilia } from './competencia';
import { identidadeDoLaudo } from './identidade-laudo';
import type { LinhaLaudo } from './linha-planilha';
import { chaveEstudo } from './nome-estudo';

export type OrigemLaudo = 'normal' | 'compartilhamento';

export type TipoAviso = TipoPendencia | 'cliente' | 'medico' | 'prioridade';

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
  resolverMedico: (nome: string) => string | null;
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

const CHAVE_DO_AVISO: Record<TipoAviso, (valor: string) => string> = {
  cliente: normalizarNome,
  medico: normalizarNomeMedico,
  estudo: chaveEstudo,
  modalidade: normalizarNome,
  especialidade: normalizarNome,
  prioridade: normalizarNome,
};

const comChave = (tipo: TipoAviso, valor: string): PendenciaCadastro => ({
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
  const conferir = (tipo: TipoAviso, valor: string, id: string | null) => {
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
  const medicoId = l.medico
    ? conferir('medico', l.medico, cadastros.resolverMedico(l.medico))
    : null;
  const medicoReassinaturaId = l.medicoReassinatura
    ? conferir('medico', l.medicoReassinatura, cadastros.resolverMedico(l.medicoReassinatura))
    : null;

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
    },
    pendencias,
    conferidos: conferidos.map(({ tipo, chave }) => ({ tipo, chave })),
  };
}
