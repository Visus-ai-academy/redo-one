import { type AnyFormApi, useStore } from '@tanstack/react-form';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';

/** Pede para fechar a camada (painel lateral ou diálogo) em que o componente está. */
export const PedirFechamento = createContext<(() => void) | undefined>(undefined);

/**
 * Guarda do fechamento de painel e diálogo: com alterações não salvas, pergunta antes ("Descartar
 * as alterações?"); sem alteração, fecha direto. `confirmacao` vai dentro da camada.
 */
export function useDescartarAlteracoes() {
  const [pendente, setPendente] = useState<(() => void) | null>(null);

  const pedir = (alterado: boolean, fechar: () => void) => {
    if (alterado) setPendente(() => fechar);
    else fechar();
  };

  const confirmacao: ReactNode = (
    <ConfirmarAcao
      acao="Descartar"
      rotuloCancelar="Continuar editando"
      titulo="Descartar as alterações?"
      consequencia="O que você mudou aqui ainda não foi salvo e se perde."
      aberto={pendente !== null}
      onAbertoChange={(abrir) => {
        if (!abrir) setPendente(null);
      }}
      onConfirmar={() => pendente?.()}
    />
  );

  return { pedir, confirmacao };
}

/**
 * O formulário tem alterações não salvas: algum valor difere do salvo (`iniciais`, os mesmos
 * `defaultValues` do `useAppForm`). Salvou e o item voltou da API, deixa de estar alterado.
 */
export function useAlterado(form: AnyFormApi, iniciais: unknown) {
  const valores = useStore(form.store, (estado) => estado.values);
  return JSON.stringify(valores) !== JSON.stringify(iniciais);
}

/** Registra se um formulário (`chave`) tem alteração não salva. */
type Registrar = (chave: object, alterado: boolean) => void;

/**
 * Coletor da camada (`PainelLateral`, `Dialogo`): fechar pergunta se algum formulário de dentro
 * avisou alteração.
 */
export const AlteradosDaCamada = createContext<Registrar | undefined>(undefined);
/**
 * Coletor da aba aberta (`Abas`): trocar de aba pergunta se algum formulário dela avisou alteração.
 * O que fica montado na troca (`AbaMantida`) e as camadas abertas de dentro ficam de fora.
 */
export const AlteradosDaAba = createContext<Registrar | undefined>(undefined);

/** Junta os avisos de `useInformarAlterado` de quem está dentro: `alterado` se algum avisou. */
export function useColetorDeAlterados() {
  const [alterados, setAlterados] = useState<ReadonlySet<object>>(() => new Set());
  const registrar = useCallback<Registrar>((chave, alterado) => {
    setAlterados((atuais) => {
      if (atuais.has(chave) === alterado) return atuais;
      const novos = new Set(atuais);
      if (alterado) novos.add(chave);
      else novos.delete(chave);
      return novos;
    });
  }, []);
  return { alterado: alterados.size > 0, registrar };
}

/**
 * O formulário avisa, numa linha, que tem alteração não salva (ex.:
 * `useInformarAlterado(useAlterado(form, iniciais))`): o painel ou diálogo em volta pergunta antes
 * de fechar, e as abas, antes de trocar. Fora deles, não faz nada. Ao sair da tela, deixa de contar.
 */
export function useInformarAlterado(alterado: boolean) {
  const camada = useContext(AlteradosDaCamada);
  const aba = useContext(AlteradosDaAba);
  const [chave] = useState(() => ({}));
  useEffect(() => {
    camada?.(chave, alterado);
    aba?.(chave, alterado);
  }, [camada, aba, chave, alterado]);
  useEffect(
    () => () => {
      camada?.(chave, false);
      aba?.(chave, false);
    },
    [camada, aba, chave],
  );
}
