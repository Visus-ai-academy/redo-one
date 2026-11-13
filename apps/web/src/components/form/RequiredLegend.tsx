/** Legenda do `*` para formulários que misturam campos obrigatórios e opcionais. */
export function RequiredLegend() {
  return (
    <p className="text-subtle-foreground text-[13px]">
      <span aria-hidden="true" className="text-destructive">
        *
      </span>{' '}
      Campo obrigatório
    </p>
  );
}
