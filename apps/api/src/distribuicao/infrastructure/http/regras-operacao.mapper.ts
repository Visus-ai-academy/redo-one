import type {
  CelulaRecebimento,
  RegraRecebimento,
  RegraUrgencia,
} from '../../domain/motor/prioridades-operacao';
import { invalida } from '../../domain/validacao';
import type {
  CelulaRecebimentoDto,
  RegraRecebimentoDto,
  RegraUrgenciaDto,
} from './dto/prioridades-operacao.dto';

export function urgenciaDoDto(d: RegraUrgenciaDto): RegraUrgencia {
  if (d.tipo !== 'prazo') {
    if (d.horas !== null) invalida('As horas da urgência só valem com "quando o prazo for menor".');
    return { tipo: d.tipo };
  }
  if (d.horas === null) invalida('Informe as horas da urgência.');
  return { tipo: 'prazo', horas: d.horas as number };
}

export const urgenciaParaDto = (u: RegraUrgencia): RegraUrgenciaDto => ({
  tipo: u.tipo,
  horas: u.tipo === 'prazo' ? u.horas : null,
});

export function recebimentoDoDto(d: RegraRecebimentoDto): RegraRecebimento {
  if (d.tipo !== 'prazo_minimo') {
    if (d.horas !== null) invalida('As horas só valem com "prazo mínimo".');
    return { tipo: d.tipo };
  }
  if (d.horas === null) invalida('Informe o prazo mínimo, em horas.');
  return { tipo: 'prazo_minimo', horas: d.horas as number };
}

export const recebimentoParaDto = (r: RegraRecebimento): RegraRecebimentoDto => ({
  tipo: r.tipo,
  horas: r.tipo === 'prazo_minimo' ? r.horas : null,
});

export const celulaDoDto = (c: CelulaRecebimentoDto): CelulaRecebimento => ({
  prioridadeOperacaoId: c.prioridadeOperacaoId,
  turnoId: c.turnoId,
  regra: recebimentoDoDto(c.regra),
});

export const celulaParaDto = (c: CelulaRecebimento): CelulaRecebimentoDto => ({
  prioridadeOperacaoId: c.prioridadeOperacaoId,
  turnoId: c.turnoId,
  regra: recebimentoParaDto(c.regra),
});
