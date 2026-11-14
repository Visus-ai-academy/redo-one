// Nome legível do aparelho de uma sessão a partir do user agent (sem biblioteca: só os casos
// comuns da equipe; o resto vira "Aparelho não identificado").

const NAVEGADORES: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SISTEMAS: [RegExp, string, boolean][] = [
  [/iPhone/, 'iPhone', true],
  [/iPad/, 'iPad', true],
  [/Android/, 'Android', true],
  [/Windows/, 'Windows', false],
  [/Macintosh|Mac OS X/, 'Mac', false],
  [/Linux/, 'Linux', false],
];

export function descreverAparelho(userAgent: string | null) {
  const navegador = userAgent && NAVEGADORES.find(([padrao]) => padrao.test(userAgent))?.[1];
  const sistema = userAgent ? SISTEMAS.find(([padrao]) => padrao.test(userAgent)) : undefined;
  if (!navegador && !sistema) return { nome: 'Aparelho não identificado', movel: false };
  const nome = [navegador, sistema && `no ${sistema[1]}`].filter(Boolean).join(' ');
  return { nome: navegador ? nome : `Aparelho ${nome}`, movel: sistema?.[2] ?? false };
}

/** IP só com o começo ("177.32.x.x"): basta para reconhecer a rede sem expor o endereço. */
export function ipParcial(ip: string | null) {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return `${v4.split('.').slice(0, 2).join('.')}.x.x`;
  return `${ip.split(':').slice(0, 2).join(':')}:x:x`;
}
