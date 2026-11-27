export type IntegracaoFocusNfe = 'focus' | 'simulador';

/**
 * Qual emissor de NFS-e sobe: `FOCUS_NFE_INTEGRACAO` quando preenchida; vazia, a Focus se houver
 * `FOCUS_NFE_TOKEN`, senão o simulador. Usada na validação do ambiente e na montagem do módulo.
 */
export function integracaoFocusNfe(get: (nome: string) => string | undefined): IntegracaoFocusNfe {
  const escolhida = get('FOCUS_NFE_INTEGRACAO');
  if (escolhida === 'focus' || escolhida === 'simulador') return escolhida;
  return get('FOCUS_NFE_TOKEN') ? 'focus' : 'simulador';
}
