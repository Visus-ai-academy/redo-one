// Conta do calendário do `CampoData`: datas "AAAA-MM-DD" puras (sem hora nem fuso), como o valor do
// <input type="date">. A aritmética é feita em UTC só como conta de calendário.

const DIA_MS = 86_400_000;
const paraUtc = (data: string) => Date.parse(`${data}T00:00:00Z`);
const deUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function somarDias(data: string, dias: number) {
  return deUtc(paraUtc(data) + dias * DIA_MS);
}

/** 0 = segunda … 6 = domingo: a semana do One começa na segunda, como na escala. */
function posicaoNaSemana(data: string) {
  return (new Date(paraUtc(data)).getUTCDay() + 6) % 7;
}

function ultimoDiaDoMes(ano: number, mesZeroBase: number) {
  return new Date(Date.UTC(ano, mesZeroBase + 1, 0)).getUTCDate();
}

/** Soma meses mantendo o dia, sem passar do último dia do mês de destino (31/03 − 1 mês = 28/02). */
export function somarMeses(data: string, meses: number) {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7)) - 1 + meses;
  const dia = Math.min(Number(data.slice(8, 10)), ultimoDiaDoMes(ano, mes));
  return deUtc(Date.UTC(ano, mes, dia));
}

export function limitar(data: string, min?: string, max?: string) {
  if (min && data < min) return min;
  if (max && data > max) return max;
  return data;
}

export function foraDoIntervalo(data: string, min?: string, max?: string) {
  return Boolean((min && data < min) || (max && data > max));
}

/** As semanas (segunda a domingo) que cobrem o mês "AAAA-MM", com os dias dos meses vizinhos. */
export function semanasDoMes(mes: string) {
  const primeiro = `${mes}-01`;
  const ultimo = somarDias(somarMeses(primeiro, 1), -1);
  let dia = somarDias(primeiro, -posicaoNaSemana(primeiro));
  const semanas: string[][] = [];
  while (dia <= ultimo) {
    const semana = Array.from({ length: 7 }, (_, i) => somarDias(dia, i));
    semanas.push(semana);
    dia = somarDias(dia, 7);
  }
  return semanas;
}

/** "2026-11-05" → "05/11/2026"; vazio continua vazio. */
export function textoDaData(data: string) {
  if (!data) return '';
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/** "05/11/2026" → "2026-11-05"; incompleto ou data que não existe → null. */
export function dataDoTexto(texto: string) {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!partes) return null;
  const [, dia, mes, ano] = partes;
  const data = `${ano}-${mes}-${dia}`;
  if (Number.isNaN(paraUtc(data)) || deUtc(paraUtc(data)) !== data) return null;
  return data;
}

/** Máscara dd/mm/aaaa enquanto digita: só números, barras nos lugares certos. */
export function mascararData(texto: string) {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join('/');
}

type Intervalo = { min?: string; max?: string };

/** O dia que a tecla leva, dentro do intervalo; null se a tecla não navega na grade. */
export function moverPorTecla(
  data: string,
  tecla: string,
  { min, max, shift = false }: Intervalo & { shift?: boolean } = {},
) {
  const destino = (() => {
    switch (tecla) {
      case 'ArrowLeft':
        return somarDias(data, -1);
      case 'ArrowRight':
        return somarDias(data, 1);
      case 'ArrowUp':
        return somarDias(data, -7);
      case 'ArrowDown':
        return somarDias(data, 7);
      case 'Home':
        return somarDias(data, -posicaoNaSemana(data));
      case 'End':
        return somarDias(data, 6 - posicaoNaSemana(data));
      case 'PageUp':
        return somarMeses(data, shift ? -12 : -1);
      case 'PageDown':
        return somarMeses(data, shift ? 12 : 1);
      default:
        return null;
    }
  })();
  return destino === null ? null : limitar(destino, min, max);
}

/** Onde o foco cai ao abrir o calendário: o valor, senão hoje, sempre dentro do intervalo. */
export function diaComFoco({ valor, hoje, min, max }: Intervalo & { valor: string; hoje: string }) {
  return limitar(valor || hoje, min, max);
}

const formatoMes = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatoDia = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-11" → "Novembro de 2026". */
export function rotuloDoMes(mes: string) {
  const texto = formatoMes.format(new Date(paraUtc(`${mes}-01`)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Nome do dia para o leitor de tela: "quarta-feira, 25 de novembro de 2026". */
export function rotuloDoDia(data: string) {
  return formatoDia.format(new Date(paraUtc(data)));
}

/** Cabeçalho da grade, segunda primeiro. */
export const DIAS_DA_SEMANA = [
  { curto: 'Seg', longo: 'segunda-feira' },
  { curto: 'Ter', longo: 'terça-feira' },
  { curto: 'Qua', longo: 'quarta-feira' },
  { curto: 'Qui', longo: 'quinta-feira' },
  { curto: 'Sex', longo: 'sexta-feira' },
  { curto: 'Sáb', longo: 'sábado' },
  { curto: 'Dom', longo: 'domingo' },
] as const;

/** O dia de hoje em Brasília, "AAAA-MM-DD". */
const formatoHoje = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function hojeEmBrasilia(agora = new Date()) {
  return formatoHoje.format(agora);
}
