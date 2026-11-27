import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { parseCrontab } from 'graphile-worker';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ComumModule } from '../comum/comum.module';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { DatabaseModule } from '../database/database.module';
import { EMISSOR_NFSE } from './application/ports/emissor-nfse';
import { FinanceiroModule, TAREFA_GERAR_RECORRENCIAS } from './financeiro.module';
import { criarEmissorNfse } from './infrastructure/criar-emissor-nfse';
import { FocusNfeEmissor } from './infrastructure/focus-nfe/focus-nfe-emissor';
import { CategoriasFinanceirasController } from './infrastructure/http/categorias-financeiras.controller';
import {
  ConfiguracoesFinanceirasController,
  InadimplenciaController,
} from './infrastructure/http/configuracoes.controller';
import { ContasBancariasController } from './infrastructure/http/contas-bancarias.controller';
import { FornecedoresController } from './infrastructure/http/fornecedores.controller';
import { ContasPagarRecorrenciasController } from './infrastructure/http/recorrencias.controller';
import {
  ContasPagarTitulosController,
  ContasReceberTitulosController,
} from './infrastructure/http/titulos.controller';
import { SimuladorEmissorNfse } from './infrastructure/simulador/simulador-emissor-nfse';

const config = (valores: Record<string, string>) => ({ get: (nome: string) => valores[nome] });

describe('criarEmissorNfse', () => {
  it('sem token, sobe o simulador', () => {
    expect(criarEmissorNfse(config({}))).toBeInstanceOf(SimuladorEmissorNfse);
  });

  it('com o token, sobe a Focus', () => {
    expect(
      criarEmissorNfse(config({ FOCUS_NFE_TOKEN: 'tok', FOCUS_NFE_AMBIENTE: 'homologacao' })),
    ).toBeInstanceOf(FocusNfeEmissor);
  });

  it('FOCUS_NFE_INTEGRACAO=simulador vence o token', () => {
    expect(
      criarEmissorNfse(
        config({
          FOCUS_NFE_TOKEN: 'tok',
          FOCUS_NFE_AMBIENTE: 'producao',
          FOCUS_NFE_INTEGRACAO: 'simulador',
        }),
      ),
    ).toBeInstanceOf(SimuladorEmissorNfse);
  });
});

describe('FinanceiroModule', () => {
  it('exporta o emissor de NFS-e e liga os controllers do financeiro', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        AuditoriaModule,
        ComumModule,
        FinanceiroModule,
      ],
    }).compile();
    await modulo.init();
    // A geração das recorrências roda todo dia pela fila, com crontab válido.
    expect(Object.keys(modulo.get(RegistroTarefas).listar())).toContain(TAREFA_GERAR_RECORRENCIAS);
    expect(modulo.get(RegistroTarefas).agenda()).toContain(
      `0 5 * * * ${TAREFA_GERAR_RECORRENCIAS}`,
    );
    expect(() => parseCrontab(modulo.get(RegistroTarefas).agenda())).not.toThrow();
    expect(modulo.get(EMISSOR_NFSE)).toBeInstanceOf(SimuladorEmissorNfse);
    expect(modulo.get(CategoriasFinanceirasController)).toBeInstanceOf(
      CategoriasFinanceirasController,
    );
    expect(modulo.get(ContasBancariasController)).toBeInstanceOf(ContasBancariasController);
    expect(modulo.get(FornecedoresController)).toBeInstanceOf(FornecedoresController);
    expect(modulo.get(ContasPagarTitulosController)).toBeInstanceOf(ContasPagarTitulosController);
    expect(modulo.get(ContasReceberTitulosController)).toBeInstanceOf(
      ContasReceberTitulosController,
    );
    expect(modulo.get(InadimplenciaController)).toBeInstanceOf(InadimplenciaController);
    expect(modulo.get(ConfiguracoesFinanceirasController)).toBeInstanceOf(
      ConfiguracoesFinanceirasController,
    );
    expect(modulo.get(ContasPagarRecorrenciasController)).toBeInstanceOf(
      ContasPagarRecorrenciasController,
    );
    await modulo.close();
  });
});
