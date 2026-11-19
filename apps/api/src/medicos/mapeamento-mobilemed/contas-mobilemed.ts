import { z } from 'zod';

import type { ClienteMobileMed } from '../../comum/mobilemed/cliente-mobilemed';
import type { ContaMobileMed } from './mapear-por-nome';

/** Pausa entre as chamadas: nada de rajada na MobileMed. */
const PAUSA_MS = 1_000;

const respostaEstados = z.object({
  estados: z.array(z.object({ id: z.number(), uf: z.string() })),
});

// A rota devolve o usuário inteiro (com hash de senha, tokens e CPF): o z.object descarta tudo
// o que não está aqui, e nada disso passa daqui.
const respostaMedicos = z.object({
  lista: z.array(
    z.object({
      id: z.number().int(),
      nome: z.string(),
      crm: z.union([z.number(), z.string()]).nullish(),
      crm_uf: z.number().nullish(),
      email_usuario: z.string().nullish(),
      is_ativo: z.union([z.boolean(), z.number()]).nullish(),
      is_excluido: z.union([z.boolean(), z.number()]).nullish(),
    }),
  ),
});

/**
 * Contas de médico ativas que a conta de serviço enxerga, em todas as unidades dela, só por
 * leitura: `GET /estados/1` (UF do CRM vem como id) e `POST /usuario/medicos/lista/empresa`
 * (sem corpo; a mesma lista do filtro de médicos do portal). Sem contas inativas ou excluídas,
 * uma vez por id.
 */
export async function lerContasMobileMed(
  cliente: ClienteMobileMed,
  esperar: (ms: number) => Promise<void>,
): Promise<ContaMobileMed[]> {
  const { estados } = await cliente.chamar('GET', '/estados/1', respostaEstados);
  const uf = new Map(estados.map((e) => [e.id, e.uf]));
  await esperar(PAUSA_MS);
  const { lista } = await cliente.chamar('POST', '/usuario/medicos/lista/empresa', respostaMedicos);
  const contas = new Map<number, ContaMobileMed>();
  for (const u of lista) {
    if (!u.is_ativo || u.is_excluido || contas.has(u.id)) continue;
    contas.set(u.id, {
      id: u.id,
      nome: u.nome,
      crm: u.crm === null || u.crm === undefined || u.crm === '' ? null : String(u.crm),
      uf: (u.crm_uf && uf.get(u.crm_uf)) || null,
      email: u.email_usuario || null,
    });
  }
  return [...contas.values()];
}
