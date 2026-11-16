// Kit de formulários: TanStack Form com campos do Base UI. Novos campos entram em `fieldComponents`.
import { createFormHook } from '@tanstack/react-form';

import { BuscaField } from './BuscaField';
import { CheckboxField } from './CheckboxField';
import { CheckboxListField } from './CheckboxListField';
import { fieldContext, formContext } from './context';
import { EscolhaMultiplaField } from './EscolhaMultiplaField';
import { NumberField } from './NumberField';
import { PasswordField } from './PasswordField';
import { RequiredLegend } from './RequiredLegend';
import { SelecaoMultiplaField } from './SelecaoMultiplaField';
import { SelectField } from './SelectField';
import { SubmitButton } from './SubmitButton';
import { TextAreaField } from './TextAreaField';
import { TextField } from './TextField';

export const { useAppForm, withForm } = createFormHook({
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
  },
  formComponents: { SubmitButton, RequiredLegend },
});
