// Datas vêm da API em UTC (ISO) e aparecem sempre no horário de Brasília.
const FUSO = 'America/Sao_Paulo';

const formatoPartes = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partes(instante: Date) {
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    formatoPartes.formatToParts(instante).find((p) => p.type === tipo)?.value ?? '';
  return {
    dia: valor('day'),
    mes: valor('month'),
    ano: valor('year'),
    hora: `${valor('hour')}:${valor('minute')}`,
  };
}

const chaveDoDia = (p: ReturnType<typeof partes>) => `${p.ano}-${p.mes}-${p.dia}`;

/** Mês do instante em Brasília, no formato da competência: "2026-11". */
export function mesDeBrasilia(instante: Date) {
  const p = partes(instante);
  return `${p.ano}-${p.mes}`;
}

/** "02/10/2026". */
export function dataDeBrasilia(iso: string) {
  const p = partes(new Date(iso));
  return `${p.dia}/${p.mes}/${p.ano}`;
}

/** Formato curto das tabelas: "Hoje, 09:12", "Ontem, 21:40", "12/11 19:31" ou "30/12/2025 10:00". */
export function dataHoraCurta(iso: string, agora = new Date()) {
  const p = partes(new Date(iso));
  const hoje = partes(agora);
  const ontem = partes(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
  if (chaveDoDia(p) === chaveDoDia(hoje)) return `Hoje, ${p.hora}`;
  if (chaveDoDia(p) === chaveDoDia(ontem)) return `Ontem, ${p.hora}`;
  if (p.ano === hoje.ano) return `${p.dia}/${p.mes} ${p.hora}`;
  return `${p.dia}/${p.mes}/${p.ano} ${p.hora}`;
}
