import { normalizarNomeMedico } from '../../medicos/comum/nome-medico';

export interface CadastroMedicos {
  medicos: { id: string; chaveNormalizada: string }[];
  aliases: { chaveNormalizada: string; medicoId: string }[];
}

/**
 * Monta o resolvedor do nome do médico que chega da MobileMed para o id do médico: o nome do
 * cadastro e depois os apelidos, como o repasse do dashboards-one.
 */
export function montarResolvedorMedico(cadastro: CadastroMedicos) {
  const porChave = new Map<string, string>();
  for (const a of cadastro.aliases) porChave.set(a.chaveNormalizada, a.medicoId);
  for (const m of cadastro.medicos) porChave.set(m.chaveNormalizada, m.id);

  return (nome: string): string | null => porChave.get(normalizarNomeMedico(nome)) ?? null;
}
