import { ConfiguracaoInvalidaError } from '../domain/validacao';
import type {
  CadastrosDistribuicao,
  Referencias,
  TipoReferencia,
} from './ports/cadastros-distribuicao';

const MENSAGEM: Readonly<Record<TipoReferencia, string>> = {
  prioridade: 'Prioridade não encontrada no catálogo.',
  turno: 'Turno não encontrado na escala.',
  especialidade: 'Especialidade não encontrada no catálogo.',
  modalidade: 'Modalidade não encontrada no catálogo.',
  subespecialidade: 'Segmento não encontrado no catálogo.',
  cliente: 'Cliente não encontrado.',
};

/** Recusa (400) a configuração que cita cadastro inexistente, antes de a chave estrangeira estourar. */
export async function exigirReferencias(
  cadastros: CadastrosDistribuicao,
  referencias: Referencias,
): Promise<void> {
  const [primeiro] = await cadastros.faltando(referencias);
  if (primeiro) throw new ConfiguracaoInvalidaError(MENSAGEM[primeiro]);
}

/** Só os campos de `depois` que mudaram; null se nada mudou (para o evento de auditoria). */
export function diferenca(antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const mudou = Object.keys(depois).filter(
    (campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]),
  );
  if (!mudou.length) return null;
  const recorte = (campos: Record<string, unknown>) =>
    Object.fromEntries(mudou.map((c) => [c, campos[c]]));
  return { antes: recorte(antes), depois: recorte(depois) };
}

/** Cópia com a lista de ids ordenada: as listas de ids são conjuntos. */
export const ordenados = (ids: readonly string[]) => [...ids].sort();
