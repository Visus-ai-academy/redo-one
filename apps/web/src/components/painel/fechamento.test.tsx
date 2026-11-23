import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAppForm } from '../form/form';
import { useAlterado } from './fechamento';

type Valores = { nome: string; papeis: string[] };

function montar(iniciais: Valores) {
  return renderHook(
    ({ salvos }: { salvos: Valores }) => {
      const form = useAppForm({ defaultValues: salvos, onSubmit: () => {} });
      return { form, alterado: useAlterado(form, salvos) };
    },
    { initialProps: { salvos: iniciais } },
  );
}

describe('useAlterado', () => {
  it('só fica alterado quando algum valor difere do que está salvo', () => {
    const { result } = montar({ nome: 'Ana', papeis: ['a'] });
    expect(result.current.alterado).toBe(false);

    act(() => result.current.form.setFieldValue('nome', 'Bia'));
    expect(result.current.alterado).toBe(true);

    act(() => result.current.form.setFieldValue('nome', 'Ana'));
    expect(result.current.alterado).toBe(false);

    act(() => result.current.form.setFieldValue('papeis', ['a', 'b']));
    expect(result.current.alterado).toBe(true);
  });

  it('salvou e o item voltou da API com os valores novos: deixa de estar alterado', () => {
    const { result, rerender } = montar({ nome: 'Ana', papeis: [] });

    act(() => result.current.form.setFieldValue('nome', 'Bia'));
    rerender({ salvos: { nome: 'Bia', papeis: [] } });

    expect(result.current.alterado).toBe(false);
  });
});
