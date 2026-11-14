export interface Paginacao {
  pagina: number;
  porPagina: number;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
}
