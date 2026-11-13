/**
 * O que uma chave de robô pode receber. Separado do catálogo de telas: robô não abre tela, só
 * chama as rotas marcadas com `@PermiteRobo()` que exigem uma destas permissões.
 */
export const PERMISSOES_ROBO: readonly { chave: string; rotulo: string }[] = [
  { chave: 'ingestao.laudos.importar', rotulo: 'Importar laudos' },
  { chave: 'ingestao.fila.importar', rotulo: 'Importar retrato da fila' },
  { chave: 'distribuicao.rodada.ler', rotulo: 'Ler rodadas de distribuição' },
  { chave: 'distribuicao.rodada.executar', rotulo: 'Executar rodadas aprovadas' },
  { chave: 'qualidade.comentarios.importar', rotulo: 'Importar comentários' },
  { chave: 'qualidade.chamados.criar', rotulo: 'Abrir chamados de qualidade' },
];

const CHAVES = new Set(PERMISSOES_ROBO.map((p) => p.chave));

export function existePermissaoRobo(chave: string): boolean {
  return CHAVES.has(chave);
}
