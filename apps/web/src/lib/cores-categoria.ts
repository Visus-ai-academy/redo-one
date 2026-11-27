// Paleta das cores de categoria (sistema.md, "Cores de categoria"): matizes bem separados e pouco
// saturados, em ordem de uso. É a escolha do `CorField`; a cor de cada item é dado do cadastro.
export const CORES_CATEGORIA = [
  { cor: '#C0525E', nome: 'Vermelho' },
  { cor: '#5A9A64', nome: 'Verde' },
  { cor: '#8462A8', nome: 'Roxo' },
  { cor: '#4E8C88', nome: 'Verde-azulado' },
  { cor: '#B5609E', nome: 'Rosa' },
  { cor: '#C9804A', nome: 'Laranja' },
  { cor: '#5677B8', nome: 'Azul' },
  { cor: '#8A8A45', nome: 'Oliva' },
  { cor: '#8C6A45', nome: 'Marrom' },
  { cor: '#B89A4A', nome: 'Mostarda' },
  { cor: '#3E4A82', nome: 'Azul-marinho' },
  { cor: '#8A4A4A', nome: 'Vinho' },
  { cor: '#4F9BC2', nome: 'Azul-claro' },
  { cor: '#6B7684', nome: 'Cinza' },
] as const;

/** A cor da paleta igual a `cor` (sem diferenciar maiúscula), ou `undefined`. */
export function corDaPaleta(cor: string) {
  const alvo = cor.trim().toUpperCase();
  return CORES_CATEGORIA.find((c) => c.cor === alvo);
}

/**
 * As cores que o campo oferece: a paleta e, se o item já tem uma cor fora dela (cadastrada antes
 * da paleta), essa cor também, para não se perder ao salvar sem mexer.
 */
export function coresDoCampo(atual: string) {
  const fora = atual.trim() !== '' && !corDaPaleta(atual);
  return [
    ...CORES_CATEGORIA.map((c) => ({ valor: c.cor as string, nome: c.nome })),
    ...(fora ? [{ valor: atual, nome: `Cor atual (${atual.trim()})` }] : []),
  ];
}

/** O valor do campo que corresponde a `atual`: a própria string se ela está na lista. */
export function valorMarcado(atual: string) {
  if (atual.trim() === '') return '';
  return corDaPaleta(atual) ? (corDaPaleta(atual)?.cor ?? atual) : atual;
}
