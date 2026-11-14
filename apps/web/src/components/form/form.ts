// Kit de formulários: TanStack Form com campos do Base UI. Novos campos entram em `fieldComponents`.
import { createFormHook } from '@tanstack/react-form';

import { fieldContext, formContext } from './context';
import { PasswordField } from './PasswordField';
import { RequiredLegend } from './RequiredLegend';
import { SelectField } from './SelectField';
import { SubmitButton } from './SubmitButton';
import { TextField } from './TextField';

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, PasswordField, SelectField },
  formComponents: { SubmitButton, RequiredLegend },
});
