import type { AnyFormApi } from '@tanstack/react-form';

/**
 * O erro que o esquema põe na lista inteira (ex.: "os percentuais precisam somar 100") fica no
 * campo da lista, que não muda quando se mexe num item; sem limpar, ele prenderia o envio.
 */
export function limparErrosDasListas(formApi: AnyFormApi, nomes: string[]) {
  for (const nome of nomes) {
    if (!formApi.getFieldMeta(nome)?.errorMap.onSubmit) continue;
    formApi.setFieldMeta(nome, (m) => ({ ...m, errorMap: { ...m.errorMap, onSubmit: undefined } }));
  }
}
