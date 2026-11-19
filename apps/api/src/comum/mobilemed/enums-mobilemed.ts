/** `prioridade_id` → grafia da MobileMed (`prioridadeEnum` do portal), a mesma da planilha. */
export const PRIORIDADES_MOBILEMED: Readonly<Record<number, string>> = {
  1: 'Rotina',
  2: 'Ambulatório',
  3: 'Urgência',
  4: 'Emergência',
  5: 'Plantão',
  6: 'Internado',
};

/**
 * `modalidade_id` → sigla da MobileMed (`modalidadeEnum` do portal, a mesma da planilha). O portal
 * troca pela lista que guardou ao entrar, com estes mesmos valores.
 */
export const MODALIDADES_MOBILEMED: Readonly<Record<number, string>> = {
  1: 'MR',
  2: 'CT',
  3: 'CR',
  4: 'DX',
  5: 'US',
  6: 'MG',
  7: 'OT',
  8: 'XA',
  9: 'CP',
  10: 'NM',
  11: 'ES',
  12: 'EEG',
  13: 'ECG',
  14: 'BMD',
};
