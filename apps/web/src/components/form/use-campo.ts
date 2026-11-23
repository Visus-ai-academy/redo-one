import { type AnyFieldApi, useStore } from '@tanstack/react-form';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ehErroDoServidor } from './erros-do-servidor';
import { registrarCampo } from './registro';

/** Texto dos erros do campo (Zod devolve objetos com `message`), sem repetir. */
export function textosDosErros(erros: readonly unknown[]): string[] {
  const textos = erros
    .map((erro) =>
      typeof erro === 'string' ? erro : (erro as { message?: string } | undefined)?.message,
    )
    .filter((texto): texto is string => Boolean(texto));
  return [...new Set(textos)];
}

/**
 * Regras de exibição de erro de todo campo do kit (e de campo próprio de uma tela):
 * - campo que a pessoa não tocou não mostra erro;
 * - o erro aparece ao sair do campo (`aoSair`) ou ao tentar enviar, não a cada tecla;
 * - mostrado, ele acompanha o valor e some assim que fica certo; depois disso, só volta ao sair
 *   de novo;
 * - erro do servidor (`mostrarErrosDoServidor`) aparece na hora e sai quando o valor muda.
 *
 * `ref` vai no `Field.Root` (ou no controle): é por ele que o envio com erro foca o primeiro campo
 * errado. `aparar` tira os espaços das pontas ao sair e antes de enviar (campos de texto).
 */
export function useCampo(field: AnyFieldApi, { aparar = false }: { aparar?: boolean } = {}) {
  const todos = textosDosErros(field.state.meta.errors);
  const servidor = field.state.meta.errorMap.onServer;
  const doServidor = ehErroDoServidor(servidor) ? servidor.message : undefined;

  const tentativas = useStore(field.form.store, (s) => s.submissionAttempts);
  const enviando = useStore(field.form.store, (s) => s.isSubmitting);
  const [saidas, setSaidas] = useState(0);
  const gatilho = `${tentativas}:${enviando}:${saidas}`;
  const [gatilhoVisto, setGatilhoVisto] = useState(gatilho);
  const [revelado, setRevelado] = useState(false);

  // Ajuste durante a renderização (padrão do React para estado derivado de evento).
  if (gatilho !== gatilhoVisto) {
    setGatilhoVisto(gatilho);
    setRevelado(todos.length > 0);
  } else if (revelado && todos.length === 0) {
    setRevelado(false);
  }

  // Erro do servidor sai quando a pessoa muda o valor.
  const valorDoErro = useRef<{ erro: unknown; valor: unknown } | null>(null);
  if (doServidor && valorDoErro.current?.erro !== servidor) {
    valorDoErro.current = { erro: servidor, valor: field.state.value };
  }
  const valor = field.state.value;
  useEffect(() => {
    const marcado = valorDoErro.current;
    if (!marcado || marcado.valor === valor) return;
    valorDoErro.current = null;
    if (field.state.meta.errorMap.onServer !== marcado.erro) return;
    field.setMeta((meta) => ({ ...meta, errorMap: { ...meta.errorMap, onServer: undefined } }));
  }, [field, valor]);

  const erros = revelado ? todos : doServidor ? [doServidor] : [];

  const aoSair = useCallback(() => {
    if (aparar && typeof field.state.value === 'string') {
      const aparado = field.state.value.trim();
      if (aparado !== field.state.value) field.handleChange(aparado);
    }
    field.handleBlur();
    setSaidas((n) => n + 1);
  }, [field, aparar]);

  const desregistrar = useRef<(() => void) | null>(null);
  const ref = useCallback(
    (elemento: HTMLElement | null) => {
      desregistrar.current?.();
      desregistrar.current = elemento
        ? registrarCampo(field.form, field.name, { elemento, aparar })
        : null;
    },
    [field.form, field.name, aparar],
  );

  return { erros, invalido: erros.length > 0, aoSair, ref };
}
