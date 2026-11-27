// Campos do kit montados em cada formulário: para focar o primeiro errado e aparar o texto antes
// de enviar sem que cada tela precise fazer isso.
type Registro = { elemento: HTMLElement; aparar: boolean };

/** Pelo `_formId`: o `useAppForm` devolve uma cópia estendida da `FormApi` que o campo recebe. */
type Formulario = { _formId: string };

const porFormulario = new Map<string, Map<string, Registro>>();

function camposDo(form: Formulario) {
  let campos = porFormulario.get(form._formId);
  if (!campos) {
    campos = new Map();
    porFormulario.set(form._formId, campos);
  }
  return campos;
}

export function registrarCampo(form: Formulario, nome: string, registro: Registro) {
  const campos = camposDo(form);
  campos.set(nome, registro);
  return () => {
    if (campos.get(nome) === registro) campos.delete(nome);
    if (campos.size === 0) porFormulario.delete(form._formId);
  };
}

/** Se o campo é do kit (decide sozinho quando mostrar o erro). */
export function campoDoKit(form: Formulario, nome: string) {
  return porFormulario.get(form._formId)?.has(nome) ?? false;
}

/** Nomes dos campos de texto que têm os espaços das pontas removidos antes de validar e salvar. */
export function camposParaAparar(form: Formulario) {
  return [...camposDo(form)].filter(([, r]) => r.aparar).map(([nome]) => nome);
}

const FOCAVEL =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"], [role="checkbox"], [role="switch"], button:not([disabled])';

/** Foca (e rola até) o primeiro campo, na ordem da tela, entre os `nomes` informados. */
export function focarPrimeiro(form: Formulario, nomes: string[]) {
  const campos = camposDo(form);
  const elementos = nomes
    .map((nome) => campos.get(nome)?.elemento)
    .filter((el): el is HTMLElement => el?.isConnected === true)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const primeiro = elementos[0];
  if (!primeiro) return;
  const alvo = primeiro.matches(FOCAVEL)
    ? primeiro
    : (primeiro.querySelector<HTMLElement>(FOCAVEL) ?? primeiro);
  alvo.focus({ preventScroll: true });
  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  alvo.scrollIntoView?.({ block: 'center', behavior: reduzido ? 'auto' : 'smooth' });
}
