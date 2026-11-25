/** Rejeita se a promessa não terminar em `ms`; o temporizador não segura o processo vivo. */
export function comPrazo<T>(promessa: Promise<T>, ms: number, oQue: string): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const estouro = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(
      () => rejeitar(new Error(`${oQue}: sem resposta no prazo de ${ms} ms`)),
      ms,
    );
    temporizador.unref?.();
  });
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(temporizador));
}
