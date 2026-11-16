import { createHash } from 'node:crypto';

export interface CamposIdentidade {
  /** Nome da empresa como chega da MobileMed (não o cliente resolvido: apelido e unificação mudam). */
  empresa: string;
  accessionNumber: string | null;
  /** HMAC do código do paciente; o código cru nunca entra na chave. */
  pacienteChave: string;
  estudo: string;
  realizacao: Date;
  laudo: Date;
}

const texto = (v: string | null) => (v ?? '').trim().toUpperCase();

/**
 * Chave natural do laudo, em hash (sha256): empresa + accession + paciente + estudo + realização
 * + laudo. A planilha da MobileMed não traz id estável; o accession falta em ~12% dos laudos e às
 * vezes é genérico ("UTI", "P.S"), por isso entram o paciente e a realização com hora. A data do
 * laudo separa o mesmo exame laudado duas vezes, que o dashboards-one conta como dois. Única em
 * 251 mil laudos reais (05–11/2026).
 */
export function identidadeDoLaudo(c: CamposIdentidade): string {
  const partes = [
    texto(c.empresa),
    texto(c.accessionNumber),
    c.pacienteChave,
    texto(c.estudo),
    c.realizacao.toISOString(),
    c.laudo.toISOString(),
  ];
  return createHash('sha256').update(JSON.stringify(partes)).digest('hex');
}
