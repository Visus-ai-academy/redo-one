import { useEffect, useState } from 'react';

/** `reservado`: espaço guardado, sem skeleton; `esqueleto`: skeleton à vista; `conteudo`: os dados. */
export type FaseDoCarregamento = 'reservado' | 'esqueleto' | 'conteudo';

/**
 * Quando mostrar o skeleton: só depois de ~200ms sem dados e, se apareceu, no mínimo ~400ms.
 * Resposta rápida troca direto para o conteúdo, sem piscar. Enquanto `reservado`, a tela guarda o
 * lugar com o tamanho certo (o `ComEsqueleto` faz isso com o skeleton invisível).
 *
 * Ex.: `const fase = useFaseDoCarregamento(!dados); if (fase !== 'conteudo') return <PainelCarregando … />`.
 */
export function useFaseDoCarregamento(
  carregando: boolean,
  { atraso = 200, minimo = 400 }: { atraso?: number; minimo?: number } = {},
): FaseDoCarregamento {
  // Quando o skeleton apareceu (null: não está à vista).
  const [desde, setDesde] = useState<number | null>(null);

  useEffect(() => {
    if (carregando) {
      if (desde !== null) return;
      const espera = setTimeout(() => setDesde(Date.now()), atraso);
      return () => clearTimeout(espera);
    }
    if (desde === null) return;
    const falta = minimo - (Date.now() - desde);
    if (falta <= 0) {
      setDesde(null);
      return;
    }
    const espera = setTimeout(() => setDesde(null), falta);
    return () => clearTimeout(espera);
  }, [carregando, desde, atraso, minimo]);

  if (desde !== null) return 'esqueleto';
  return carregando ? 'reservado' : 'conteudo';
}
