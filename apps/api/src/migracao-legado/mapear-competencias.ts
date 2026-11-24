import type { competencias } from '../database/schema';
import { type Aviso, texto } from './comum';
import type { LegadoCompetencia } from './legado';

export interface CompetenciasMigradas {
  tabelas: { competencias: (typeof competencias.$inferInsert)[] };
  avisos: Aviso[];
}

/**
 * `fechamentos_periodo` vira `competencias`. O autor (e-mail ou texto como `claude-code`) casa com
 * o usuário do redo-one pelo e-mail; sem usuário, o texto fica em `*_por_legado`. Os cortes por
 * cliente não migram: todos ficam no padrão.
 */
export function mapearCompetencias(
  legado: LegadoCompetencia[],
  ctx: { usuarios: { id: string; email: string }[] },
): CompetenciasMigradas {
  const avisos: Aviso[] = [];
  const porEmail = new Map(ctx.usuarios.map((u) => [u.email.trim().toLowerCase(), u.id]));
  const autor = (valor: string | null) => {
    const nome = texto(valor);
    const id = nome ? (porEmail.get(nome.toLowerCase()) ?? null) : null;
    return { id, legado: nome && !id ? nome : null };
  };
  const data = (valor: string | null) => (valor ? new Date(valor) : null);

  const linhas: CompetenciasMigradas['tabelas']['competencias'] = [];
  for (const l of legado) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(l.competencia)) {
      avisos.push({
        tabela: 'competencias',
        item: l.competencia,
        motivo: 'Competência fora do formato AAAA-MM: ficou de fora.',
      });
      continue;
    }
    const fechou = autor(l.fechadoPor);
    const reabriu = autor(l.reabertoPor);
    const travou = autor(l.importacaoTravadaPor);
    linhas.push({
      competencia: l.competencia,
      status: l.status === 'fechado' ? 'fechada' : 'aberta',
      fechadaEm: data(l.dataFechamento),
      fechadaPorId: fechou.id,
      fechadaPorLegado: fechou.legado,
      reabertaEm: data(l.reabertoEm),
      reabertaPorId: reabriu.id,
      reabertaPorLegado: reabriu.legado,
      importacaoTravadaEm: data(l.importacaoTravadaEm),
      importacaoTravadaPorId: travou.id,
      importacaoTravadaPorLegado: travou.legado,
      observacoes: texto(l.observacoes),
    });
  }
  return { tabelas: { competencias: linhas }, avisos };
}
