import { z } from 'zod';

import type { ClienteMobileMed } from '../../comum/mobilemed/cliente-mobilemed';
import { buscarFatiado } from '../../ingestao/infrastructure/mobilemed/buscar-fatiado';
import { filtroDescritivo } from '../../ingestao/infrastructure/mobilemed/relatorio-mobilemed-http';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Pausa depois de cada chamada: o relatório é pesado para a MobileMed. */
const PAUSA_MS = 2_000;
/** A lista vem cortada no teto em silêncio; `buscarFatiado` divide a janela que chega nele. */
const TETO = 50_000;

// Só os ids: o z.object descarta o resto do item (paciente, estudo, unidade...).
const respostaLaudos = z.object({
  lista: z.array(
    z.object({
      id: z.number().int(),
      usuario_id: z.number().int().nullish(),
      medico_primeiro_laudo_id: z.number().int().nullish(),
    }),
  ),
});

export type LaudoMobileMed = { usuarioId: number | null; primeiroId: number | null };

/**
 * Quem assinou e quem deu o 1º laudo de cada exame laudado em `[de, ate)`, pelo relatório
 * "Descritivo Especialidades" (`reports-api`, o mesmo da ingestão, nos dois recortes), só leitura.
 */
export async function lerLaudosMobileMed(
  cliente: ClienteMobileMed,
  de: Date,
  ate: Date,
  opcoes: { janelaDias: number; esperar: (ms: number) => Promise<void> },
): Promise<Map<number, LaudoMobileMed>> {
  const laudos = new Map<number, LaudoMobileMed>();
  for (const exibirNaoTratados of [false, '1'] as const) {
    const itens = await buscarFatiado(de, ate, opcoes.janelaDias * DIA_MS, TETO, async (a, b) => {
      const { lista } = await cliente.chamar(
        'POST',
        '/exame/relatorio/descritivoEspecialidade',
        respostaLaudos,
        {
          filtro: { ...filtroDescritivo(a, b), exibirNaoTratados },
          paginacao: { pagina: 1, total_registros: 50 },
        },
      );
      await opcoes.esperar(PAUSA_MS);
      return lista;
    });
    for (const item of itens) {
      laudos.set(item.id, {
        usuarioId: item.usuario_id ?? null,
        primeiroId: item.medico_primeiro_laudo_id ?? null,
      });
    }
  }
  return laudos;
}
