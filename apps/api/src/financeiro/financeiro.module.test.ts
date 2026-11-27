import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { DatabaseModule } from '../database/database.module';
import { EMISSOR_NFSE } from './application/ports/emissor-nfse';
import { FinanceiroModule } from './financeiro.module';
import { criarEmissorNfse } from './infrastructure/criar-emissor-nfse';
import { FocusNfeEmissor } from './infrastructure/focus-nfe/focus-nfe-emissor';
import { CategoriasFinanceirasController } from './infrastructure/http/categorias-financeiras.controller';
import { ContasBancariasController } from './infrastructure/http/contas-bancarias.controller';
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
        FinanceiroModule,
      ],
    }).compile();
    expect(modulo.get(EMISSOR_NFSE)).toBeInstanceOf(SimuladorEmissorNfse);
    expect(modulo.get(CategoriasFinanceirasController)).toBeInstanceOf(
      CategoriasFinanceirasController,
    );
    expect(modulo.get(ContasBancariasController)).toBeInstanceOf(ContasBancariasController);
  });
});
