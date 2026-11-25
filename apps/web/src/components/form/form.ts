// Kit de formulários: TanStack Form com campos do Base UI. Novos campos entram em `fieldComponents`.
import {
  type AnyFormApi,
  createFormHook,
  defaultValidationLogic,
  type ValidationLogicFn,
} from '@tanstack/react-form';
import { useState } from 'react';

import { BuscaField } from './BuscaField';
import { CaixasComContagemField } from './CaixasComContagemField';
import { CheckboxField } from './CheckboxField';
import { CheckboxListField } from './CheckboxListField';
import { fieldContext, formContext } from './context';
import { EscolhaMultiplaField } from './EscolhaMultiplaField';
import { EscolhidosField } from './EscolhidosField';
import { EtiquetasField } from './EtiquetasField';
import { NumberField } from './NumberField';
import { PasswordField } from './PasswordField';
import { RequiredLegend } from './RequiredLegend';
import { campoDoKit, camposParaAparar, focarPrimeiro } from './registro';
import { SelecaoMultiplaField } from './SelecaoMultiplaField';
import { SelectField } from './SelectField';
import { SubmitButton } from './SubmitButton';
import { TextAreaField } from './TextAreaField';
import { TextField } from './TextField';

const kit = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    PasswordField,
    SelectField,
    CheckboxField,
    CheckboxListField,
    BuscaField,
    EscolhaMultiplaField,
    TextAreaField,
    NumberField,
    SelecaoMultiplaField,
    CaixasComContagemField,
    EscolhidosField,
    EtiquetasField,
  },
  formComponents: { SubmitButton, RequiredLegend },
});

export const { withForm } = kit;

type ErrosDoEsquema = { form?: unknown; fields?: Record<string, unknown> };

/**
 * Do resultado do schema, só o erro dos campos que já podem mostrá-lo: os do kit (o `useCampo`
 * decide quando aparece) e os que já estão com erro (para ele sumir ou mudar ao corrigir). Campo
 * próprio de uma tela, sem erro ainda, só ganha erro ao enviar.
 */
function errosQuePodemAparecer(form: AnyFormApi, bruto: unknown) {
  const fields = (bruto as ErrosDoEsquema | undefined)?.fields;
  if (!fields || typeof fields !== 'object') return undefined;
  const filtrados = Object.fromEntries(
    Object.entries(fields).filter(
      ([nome]) => campoDoKit(form, nome) || (form.state.fieldMeta[nome]?.errors.length ?? 0) > 0,
    ),
  );
  return Object.keys(filtrados).length > 0 ? { fields: filtrados } : undefined;
}

/**
 * O schema de `validators.onSubmit` também roda ao mudar e ao sair de qualquer campo, para o erro
 * aparecer ao sair do campo e sumir assim que o valor fica certo. Quem decide o que a pessoa vê é
 * o `useCampo` (campo não tocado não mostra erro; enquanto digita, só some, não aparece). O
 * resultado fica na chave `onDynamic`: a `onSubmit` o próprio campo limpa ao validar. Só o schema
 * síncrono roda ao vivo; o `onSubmitAsync` continua só no envio.
 */
export const validarAoMudarEAoSair: ValidationLogicFn = (props) => {
  const esquema = props.validators?.onSubmit;
  if (
    (props.event.type !== 'change' && props.event.type !== 'blur') ||
    props.event.async ||
    !esquema
  ) {
    return defaultValidationLogic(props);
  }
  const aoVivo = {
    cause: 'dynamic' as const,
    fn: (valor: { value: unknown; formApi: AnyFormApi }) =>
      errosQuePodemAparecer(
        valor.formApi,
        valor.formApi.runValidator({
          validate: esquema,
          value: { ...valor, validationSource: 'form' },
          type: 'validate',
        }),
      ),
  };
  return defaultValidationLogic({
    ...props,
    runValidation: ({ validators, form }) =>
      props.runValidation({ validators: [...validators, aoVivo], form }),
  });
};

function camposComErro(form: AnyFormApi) {
  return Object.entries(form.state.fieldMeta)
    .filter(([, meta]) => (meta?.errors.length ?? 0) > 0)
    .map(([nome]) => nome);
}

/**
 * Antes de validar e enviar: tira os espaços das pontas dos campos de texto do kit e descarta o
 * resultado da validação ao vivo (`onDynamic`). Sem isso, um erro ao vivo faria o TanStack Form
 * parar antes do schema de envio, e os erros dos outros campos não apareceriam.
 */
function prepararEnvio(form: AnyFormApi) {
  for (const nome of camposParaAparar(form)) {
    const valor = form.getFieldValue(nome);
    if (typeof valor === 'string' && valor !== valor.trim()) form.setFieldValue(nome, valor.trim());
  }
  for (const [nome, meta] of Object.entries(form.state.fieldMeta)) {
    if (!meta?.errorMap.onDynamic) continue;
    form.setFieldMeta(nome, (m) => ({ ...m, errorMap: { ...m.errorMap, onDynamic: undefined } }));
  }
}

/**
 * `useAppForm` do kit, com o comportamento das regras de formulário para toda tela:
 * valida ao sair do campo e limpa o erro ao corrigir; ao enviar com erro, foca (e rola até) o
 * primeiro campo errado; apara o texto antes de enviar. Uso igual ao do TanStack Form.
 */
export const useAppForm = ((opcoes: Parameters<typeof kit.useAppForm>[0]) => {
  const form = kit.useAppForm({
    validationLogic: validarAoMudarEAoSair,
    // Com erro já à vista, o envio ainda roda a validação completa (e mostra todos os erros).
    canSubmitWhenInvalid: true,
    ...opcoes,
    onSubmitInvalid: (props) => {
      opcoes.onSubmitInvalid?.(props);
      // Depois de o React mostrar os erros.
      setTimeout(() => focarPrimeiro(props.formApi, camposComErro(props.formApi)), 0);
    },
  });
  useState(() => {
    const enviar = form.handleSubmit;
    form.handleSubmit = ((meta?: unknown) => {
      prepararEnvio(form as unknown as AnyFormApi);
      return (enviar as (m?: unknown) => Promise<void>)(meta);
    }) as typeof form.handleSubmit;
    return null;
  });
  return form;
}) as unknown as typeof kit.useAppForm;
