import type { RegrasFrente } from '../../domain/motor/configuracao';
import { invalida } from '../../domain/validacao';
import type { RegrasFrenteDto } from './dto/regras-frente.dto';

/** Do formato da tela para o do motor (campo da Lista ausente = segue a regra padrão). */
export function regrasDoDto(dto: RegrasFrenteDto): Omit<RegrasFrente, 'frente'> {
  if (dto.listaPrazo === 'minimo' && dto.listaPrazoMinimoHoras === null) {
    invalida('Informe o prazo mínimo da Lista, em horas.');
  }
  if (dto.listaPrazo !== 'minimo' && dto.listaPrazoMinimoHoras !== null) {
    invalida('O prazo mínimo da Lista só vale com "prazo mínimo".');
  }
  if (dto.divisao === 'igualitaria' && dto.proporcoes.length) {
    invalida('A divisão igualitária não tem proporção por modalidade.');
  }
  return {
    ...(dto.listaPrioridadeIds === null ? {} : { listaPrioridadeIds: dto.listaPrioridadeIds }),
    ...(dto.listaPrazo === 'padrao'
      ? {}
      : { listaPrazoMinimoHoras: dto.listaPrazo === 'sla' ? null : dto.listaPrazoMinimoHoras }),
    recolheAoFimDoTurno: dto.recolheAoFimDoTurno,
    distribuiPeloRobo: dto.distribuiPeloRobo,
    horariosSemRobo: dto.horariosSemRobo.map((h) => ({
      diasSemana: h.diasSemana,
      inicio: h.inicio,
      fim: h.fim,
    })),
    divisao:
      dto.divisao === 'proporcao'
        ? {
            metodo: 'proporcao',
            proporcoes: dto.proporcoes.map((p) => ({
              modalidadeId: p.modalidadeId,
              percentual: p.percentual,
            })),
          }
        : { metodo: 'igualitaria' },
    tetoPorMedico: dto.tetoPorMedico,
    segmentos: dto.segmentos.map((s) => ({
      subespecialidadeId: s.subespecialidadeId,
      teto: s.teto,
      tetoReduzido: s.tetoReduzido && {
        produtividadeAte: s.tetoReduzido.produtividadeAte,
        teto: s.tetoReduzido.teto,
      },
      piso: s.piso,
      pacoteAParte: s.pacoteAParte,
    })),
    mistura: dto.mistura.map((f) => ({
      especialidadeId: f.especialidadeId,
      subespecialidadeId: f.subespecialidadeId,
    })),
    listaDepoisDosFixos: dto.listaDepoisDosFixos,
  };
}

export function regrasParaDto(r: RegrasFrente): RegrasFrenteDto {
  const prazo = r.listaPrazoMinimoHoras;
  return {
    listaPrioridadeIds: r.listaPrioridadeIds ?? null,
    listaPrazo: prazo === undefined ? 'padrao' : prazo === null ? 'sla' : 'minimo',
    listaPrazoMinimoHoras: prazo ?? null,
    recolheAoFimDoTurno: r.recolheAoFimDoTurno,
    distribuiPeloRobo: r.distribuiPeloRobo,
    horariosSemRobo: r.horariosSemRobo.map((h) => ({ ...h, diasSemana: [...h.diasSemana] })),
    divisao: r.divisao.metodo,
    proporcoes: r.divisao.metodo === 'proporcao' ? r.divisao.proporcoes : [],
    tetoPorMedico: r.tetoPorMedico,
    segmentos: r.segmentos,
    mistura: r.mistura,
    listaDepoisDosFixos: r.listaDepoisDosFixos,
  };
}
