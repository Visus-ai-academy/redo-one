// Espelha a política da API (apps/api/src/identidade/senha/politica-senha.ts) para mostrar os
// requisitos enquanto a pessoa digita; quem decide é a API.
export const TAMANHO_MINIMO_SENHA = 8;

export function senhaTemLetraENumero(senha: string) {
  return /\p{L}/u.test(senha) && /\p{N}/u.test(senha);
}

export function requisitosDaSenha(senha: string, confirmacao: string) {
  return [
    { texto: 'Pelo menos 8 caracteres', atendido: senha.length >= TAMANHO_MINIMO_SENHA },
    { texto: 'Letras e números', atendido: senhaTemLetraENumero(senha) },
    { texto: 'As duas senhas são iguais', atendido: senha.length > 0 && senha === confirmacao },
  ];
}
