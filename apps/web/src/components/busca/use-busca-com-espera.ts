import { useEffect, useRef, useState } from 'react';

const ESPERA_DA_BUSCA_MS = 300;

/**
 * Texto do `CampoBusca` de uma lista cuja busca mora na URL. O que se digita vai para a URL (e para
 * a API) só depois de uma pausa na digitação. Quando a URL alcança a busca que o próprio campo
 * mandou, o campo não é tocado: a pessoa já pode ter digitado mais. Só uma mudança por fora
 * ("Limpar filtros", troca de aba, voltar do navegador) reescreve o campo.
 */
export function useBuscaComEspera(
  valorDaUrl: string | undefined,
  onBuscar: (busca: string | undefined) => void,
) {
  const [termo, setTermo] = useState(valorDaUrl ?? '');
  const enviado = useRef(valorDaUrl);

  useEffect(() => {
    const busca = termo.trim() || undefined;
    if (busca === valorDaUrl) return;
    const espera = setTimeout(() => {
      enviado.current = busca;
      onBuscar(busca);
    }, ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(espera);
  }, [termo, valorDaUrl, onBuscar]);

  useEffect(() => {
    if (valorDaUrl === enviado.current) return;
    enviado.current = valorDaUrl;
    setTermo(valorDaUrl ?? '');
  }, [valorDaUrl]);

  return [termo, setTermo] as const;
}
