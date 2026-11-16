import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { ItemEmUsoError, NomeEmUsoError } from '../../catalogo/comum/catalogo.errors';
import { InMemoryListaRepository } from '../../catalogo/testing/fakes';
import { FixedClock } from '../../identidade/testing/fakes';
import { EscalaInvalidaError } from '../domain/errors';
import { type DadosTipoAusencia, TiposAusenciaService } from './tipos-ausencia.service';

const AGORA = new Date('2026-11-16T12:00:00Z');
const ator = { usuarioId: 'u-ana' };

const dados = (nome: string, extra: Partial<DadosTipoAusencia> = {}): DadosTipoAusencia => ({
  nome,
  gravidade: 0,
  soGestor: false,
  contaComoFalta: false,
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  ...extra,
});

describe('TiposAusenciaService', () => {
  let repo: InMemoryListaRepository<DadosTipoAusencia>;
  let auditoria: InMemoryAuditoria;
  let service: TiposAusenciaService;

  beforeEach(() => {
    repo = new InMemoryListaRepository<DadosTipoAusencia>();
    auditoria = new InMemoryAuditoria();
    service = new TiposAusenciaService(repo, auditoria, new FixedClock(AGORA));
  });

  it('cria com gravidade e marcas e audita como tipo_ausencia', async () => {
    const id = await service.criar(
      ator,
      dados(' Falta ', { gravidade: 3, soGestor: true, contaComoFalta: true }),
    );

    expect(await service.obter(id)).toMatchObject({
      nome: 'Falta',
      gravidade: 3,
      soGestor: true,
      contaComoFalta: true,
    });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({ entidade: 'tipo_ausencia', entidadeId: id, acao: 'criado' }),
    ]);
  });

  it('gravidade é inteiro de 0 em diante', async () => {
    await expect(service.criar(ator, dados('Férias', { gravidade: -1 }))).rejects.toThrow(
      EscalaInvalidaError,
    );
    await expect(service.criar(ator, dados('Férias', { gravidade: 1.5 }))).rejects.toThrow(
      'A gravidade é um número inteiro, de 0 em diante.',
    );
  });

  it('nome único com a mensagem do tipo de ausência', async () => {
    await service.criar(ator, dados('Férias'));

    await expect(service.criar(ator, dados('FÉRIAS'))).rejects.toThrow(NomeEmUsoError);
    await expect(service.criar(ator, dados('FÉRIAS'))).rejects.toThrow(
      'Já existe um tipo de ausência chamado "FÉRIAS".',
    );
  });

  it('não exclui tipo em uso', async () => {
    const id = await service.criar(ator, dados('Férias'));
    repo.emUso.add(id);

    await expect(service.excluir(ator, id)).rejects.toThrow(ItemEmUsoError);
    await expect(service.excluir(ator, id)).rejects.toThrow(
      'O tipo de ausência está em uso. Desative-o em vez de excluir.',
    );
  });
});
