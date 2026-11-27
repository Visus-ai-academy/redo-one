import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class JustificativaCancelamentoInvalida extends ErroDeDominio {
  readonly tipo = 'invalido' as const;
}

// Tamanho do motivo do cancelamento (xMotivo) no leiaute da NFS-e Nacional.
const MINIMO = 15;
const MAXIMO = 255;

/** Justificativa do cancelamento de uma NFS-e, aparada; recusa a que o portal nacional recusaria. */
export function justificativaCancelamento(texto: string): string {
  const limpa = texto.trim().replace(/\s+/g, ' ');
  if (limpa.length < MINIMO || limpa.length > MAXIMO) {
    throw new JustificativaCancelamentoInvalida(
      `A justificativa do cancelamento precisa ter de ${MINIMO} a ${MAXIMO} caracteres.`,
    );
  }
  return limpa;
}
