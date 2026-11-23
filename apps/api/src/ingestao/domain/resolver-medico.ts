import { normalizarNomeMedico } from '../../medicos/comum/nome-medico';

export interface CadastroMedicos {
  medicos: { id: string; chaveNormalizada: string; idMobilemed: number | null }[];
  aliases: { chaveNormalizada: string; medicoId: string }[];
}

/**
 * Monta o resolvedor do médico que chega da MobileMed para o id do médico. O id da conta
 * MobileMed (só a importação pela API traz) vem primeiro: cadastrado em `id_mobilemed`, vale
 * aquele médico. Sem id, ou com id desconhecido, vale o nome: o do cadastro e depois os apelidos,
 * como o repasse do dashboards-one.
 */
export function montarResolvedorMedico(cadastro: CadastroMedicos) {
  const porChave = new Map<string, string>();
  for (const a of cadastro.aliases) porChave.set(a.chaveNormalizada, a.medicoId);
  for (const m of cadastro.medicos) porChave.set(m.chaveNormalizada, m.id);
  const porIdMobilemed = new Map<number, string>();
  for (const m of cadastro.medicos) if (m.idMobilemed) porIdMobilemed.set(m.idMobilemed, m.id);

  return (nome: string | null, idMobilemed: number | null): string | null =>
    (idMobilemed ? porIdMobilemed.get(idMobilemed) : undefined) ??
    (nome ? porChave.get(normalizarNomeMedico(nome)) : undefined) ??
    null;
}
