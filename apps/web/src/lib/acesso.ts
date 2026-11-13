/** Destino depois do login: só caminhos internos, para o `?redirect=` não virar redirecionamento aberto. */
export function destinoSeguro(destino: string | undefined) {
  if (!destino?.startsWith('/') || destino.startsWith('//') || destino.startsWith('/\\'))
    return '/';
  return destino;
}

const formatoHora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** Hora (HH:MM) em Brasília de um instante ISO vindo da API. */
export function horaDeBrasilia(instante: string) {
  return formatoHora.format(new Date(instante));
}
