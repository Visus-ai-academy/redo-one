import { z } from 'zod';

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

/** Regra da senha nova nos formulários (mesmas mensagens que a API devolve). */
export const regraNovaSenha = z
  .string()
  .min(TAMANHO_MINIMO_SENHA, 'Use pelo menos 8 caracteres.')
  .refine(senhaTemLetraENumero, 'Use letras e números.');

/** Para `.refine(senhasIguais, ERRO_CONFIRMACAO)`: a confirmação repete a senha nova. */
export const senhasIguais = (valores: { senha: string; confirmacao: string }) =>
  valores.senha === valores.confirmacao;

export const ERRO_CONFIRMACAO = { path: ['confirmacao'], message: 'As senhas não são iguais.' };
