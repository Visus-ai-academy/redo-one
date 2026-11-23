import type { AnyFormApi } from '@tanstack/react-form';

import { ResponseError } from '../../gen/.kubb/client';

/** Erro que veio da API para um campo: fica até a pessoa mudar o valor do campo. */
export type ErroDoServidor = { message: string; origem: 'servidor' };

export const ehErroDoServidor = (erro: unknown): erro is ErroDoServidor =>
  typeof erro === 'object' && erro !== null && (erro as ErroDoServidor).origem === 'servidor';

/**
 * Põe no campo o erro que a API devolveu sobre ele (400, 409, 422), como a validação local faz.
 * A API indica o campo com `campo` (e a `message`) ou vários com `campos: { nome: mensagem }`.
 * Devolve `true` se algum campo recebeu erro; senão a tela mostra a mensagem geral (`Alerta`
 * acima do rodapé do formulário).
 *
 * Ex.: `onError: (erro) => mostrarErrosDoServidor(form, erro) || setErroGeral(erro)`.
 */
export function mostrarErrosDoServidor(form: AnyFormApi, erro: unknown): boolean {
  if (!ResponseError.is(erro) || ![400, 409, 422].includes(erro.status)) return false;
  const corpo = (erro.data ?? {}) as { message?: unknown; campo?: unknown; campos?: unknown };
  const porCampo: Record<string, string> = {};
  if (typeof corpo.campo === 'string' && typeof corpo.message === 'string') {
    porCampo[corpo.campo] = corpo.message;
  }
  if (corpo.campos && typeof corpo.campos === 'object') {
    for (const [nome, mensagem] of Object.entries(corpo.campos)) {
      if (typeof mensagem === 'string') porCampo[nome] = mensagem;
    }
  }
  const nomes = Object.keys(porCampo).filter(
    (nome) => nome in form.state.fieldMeta || nome in form.state.values,
  );
  for (const nome of nomes) {
    const valor: ErroDoServidor = { message: porCampo[nome] ?? '', origem: 'servidor' };
    form.setFieldMeta(nome, (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: valor },
    }));
  }
  return nomes.length > 0;
}
