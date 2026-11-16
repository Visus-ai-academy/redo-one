import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import type { AliasesMedicoService } from '../aliases/aliases-medico.service';
import type { PagamentoMedicoService } from '../pagamento/pagamento-medico.service';
import { MedicosController } from './medicos.controller';
import type { MedicosService } from './medicos.service';

describe('MedicosController', () => {
  const reflector = new Reflector();
  const exigidas = (m: keyof MedicosController) =>
    reflector.get(PERMISSOES_EXIGIDAS, MedicosController.prototype[m]);

  it('fica em /medicos; ler exige medicos.ver; mudar (inclusive apelidos) segue o verbo', () => {
    expect(reflector.get(PATH_METADATA, MedicosController)).toBe('medicos');
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['medicos.ver'], ['medicos.ver']]);
    const esperado = {
      criar: 'medicos.criar',
      atualizar: 'medicos.editar',
      excluir: 'medicos.excluir',
      criarAlias: 'medicos.criar',
      excluirAlias: 'medicos.excluir',
    } as const;
    for (const [m, chave] of Object.entries(esperado)) {
      expect(exigidas(m as keyof typeof esperado)).toEqual([chave]);
    }
  });

  it('pagamento tem permissão própria para ver e para editar', () => {
    expect(exigidas('obterPagamento')).toEqual(['medicos.pagamento.ver']);
    expect(exigidas('salvarPagamento')).toEqual(['medicos.pagamento.editar']);
  });

  it('lê o pagamento em nome de quem está logado (a leitura é auditada)', async () => {
    const pagamento = { obter: vi.fn(async () => ({ cpf: '12345678901' })) };
    const controller = new MedicosController(
      {} as MedicosService,
      {} as AliasesMedicoService,
      pagamento as unknown as PagamentoMedicoService,
    );

    await controller.obterPagamento({ usuarioId: 'u-ana' } as PrincipalUsuario, 'm-1');

    expect(pagamento.obter).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 'm-1');
  });
});
