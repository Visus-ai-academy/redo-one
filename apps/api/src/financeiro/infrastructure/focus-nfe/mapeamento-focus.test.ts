import { describe, expect, it } from 'vitest';

import type { DadosEmpresaEmissora, NotaFiscalServico } from '../../application/ports/emissor-nfse';
import {
  empresaDaResposta,
  erroDaResposta,
  payloadEmpresa,
  payloadNfse,
  situacaoDaResposta,
} from './mapeamento-focus';

const empresa: DadosEmpresaEmissora = {
  cnpj: '12.345.678/0001-90',
  razaoSocial: 'Teleimagem Ltda',
  nomeFantasia: 'Teleimagem',
  inscricaoMunicipal: '123456',
  regimeTributario: 'regime_normal',
  endereco: {
    logradouro: 'Rua A',
    numero: '100',
    complemento: null,
    bairro: 'Centro',
    municipio: 'Curitiba',
    uf: 'PR',
    cep: '80000-000',
  },
  email: 'fiscal@exemplo.com',
  telefone: null,
  enviarEmailTomador: true,
};

const nota: NotaFiscalServico = {
  dataEmissao: new Date('2026-11-27T15:30:00Z'),
  dataCompetencia: '2026-11-01',
  prestador: {
    cnpj: '12.345.678/0001-90',
    codigoMunicipio: '4106902',
    inscricaoMunicipal: '123456',
    opcaoSimplesNacional: 'nao_optante',
    regimeApuracaoSimplesNacional: null,
    regimeEspecialTributacao: 0,
  },
  tomador: {
    documento: { tipo: 'cnpj', numero: '98.765.432/0001-10' },
    razaoSocial: '  Clínica   Exemplo  ',
    email: 'financeiro@clinica.com',
    telefone: '(41) 3333-4444',
    endereco: {
      logradouro: 'Av. B',
      numero: '200',
      bairro: 'Batel',
      codigoMunicipio: '4106902',
      cep: '80420-000',
    },
  },
  servico: {
    codigoMunicipioPrestacao: '4106902',
    codigoTributacaoNacional: '040301',
    codigoTributacaoMunicipal: null,
    codigoNbs: null,
    descricao: 'Laudos de exames de imagem - competência 11/2026',
    valorCentavos: 1_234_567,
    tributacaoIss: 1,
    tipoRetencaoIss: 1,
    aliquotaIssPct: 2,
  },
  ibsCbs: null,
};

describe('payloadEmpresa', () => {
  it('monta o cadastro da Focus só com dígitos no CNPJ e CEP e o regime pelo código', () => {
    expect(payloadEmpresa(empresa, 'producao')).toEqual({
      nome: 'Teleimagem Ltda',
      nome_fantasia: 'Teleimagem',
      cnpj: '12345678000190',
      inscricao_municipal: '123456',
      regime_tributario: '3',
      logradouro: 'Rua A',
      numero: '100',
      bairro: 'Centro',
      municipio: 'Curitiba',
      uf: 'PR',
      cep: '80000000',
      email: 'fiscal@exemplo.com',
      enviar_email_destinatario: true,
      habilita_nfsen_producao: true,
    });
  });

  it.each([
    ['simples_nacional', '1'],
    ['simples_nacional_excesso_sublimite', '2'],
    ['regime_normal', '3'],
    ['mei', '4'],
  ] as const)('regime %s vira %s', (regime, codigo) => {
    expect(
      payloadEmpresa({ ...empresa, regimeTributario: regime }, 'producao').regime_tributario,
    ).toBe(codigo);
  });

  it('inscrição municipal nula vai vazia, para apagar a do emissor (campo ausente não apaga)', () => {
    expect(payloadEmpresa({ ...empresa, inscricaoMunicipal: null }, 'producao')).toMatchObject({
      inscricao_municipal: '',
    });
  });

  it('habilita só o ambiente configurado e não desliga o outro', () => {
    const payload = payloadEmpresa(empresa, 'homologacao');
    expect(payload.habilita_nfsen_homologacao).toBe(true);
    expect(payload).not.toHaveProperty('habilita_nfsen_producao');
  });

  it('o certificado só vai quando é enviado', () => {
    expect(payloadEmpresa(empresa, 'producao')).not.toHaveProperty('arquivo_certificado_base64');
    const comCertificado = payloadEmpresa(
      { ...empresa, certificado: { arquivoBase64: 'UEZY', senha: 's3nh4' } },
      'producao',
    );
    expect(comCertificado).toMatchObject({
      arquivo_certificado_base64: 'UEZY',
      senha_certificado: 's3nh4',
    });
  });
});

describe('empresaDaResposta', () => {
  it('lê id, certificado, habilitação e tokens protegidos', () => {
    const resposta = empresaDaResposta({
      id: 123,
      nome: 'Teleimagem Ltda',
      cnpj: '12345678000190',
      certificado_valido_de: '2026-01-10T00:00:00-03:00',
      certificado_valido_ate: '2027-01-10T00:00:00-03:00',
      certificado_cnpj: '12.345.678/0001-90',
      habilita_nfsen_producao: true,
      habilita_nfsen_homologacao: false,
      token_producao: 'tok-prod',
      token_homologacao: '',
    });
    expect(resposta).toMatchObject({
      id: '123',
      cnpj: '12345678000190',
      razaoSocial: 'Teleimagem Ltda',
      certificado: {
        cnpjTitular: '12345678000190',
        validoDe: new Date('2026-01-10T03:00:00Z'),
        validoAte: new Date('2027-01-10T03:00:00Z'),
      },
      habilitada: { producao: true, homologacao: false },
    });
    expect(resposta.tokens.producao?.revelar()).toBe('tok-prod');
    expect(resposta.tokens.homologacao).toBeNull();
    expect(JSON.stringify(resposta)).not.toContain('tok-prod');
  });

  it('sem certificado instalado, certificado é null', () => {
    expect(empresaDaResposta({ id: 1, cnpj: '12345678000190' }).certificado).toBeNull();
  });

  it('recusa resposta sem id', () => {
    expect(() => empresaDaResposta({ cnpj: '1' })).toThrow(
      expect.objectContaining({ tipo: 'resposta_inesperada' }),
    );
  });
});

describe('payloadNfse', () => {
  it('monta a DPS nacional com o valor em reais e o tomador limpo', () => {
    expect(payloadNfse(nota)).toEqual({
      data_emissao: '2026-11-27T12:30:00-03:00',
      data_competencia: '2026-11-01',
      cnpj_prestador: '12345678000190',
      codigo_municipio_emissora: 4106902,
      inscricao_municipal_prestador: '123456',
      codigo_opcao_simples_nacional: '1',
      regime_especial_tributacao: '0',
      cnpj_tomador: '98765432000110',
      razao_social_tomador: 'Clínica Exemplo',
      email_tomador: 'financeiro@clinica.com',
      telefone_tomador: '4133334444',
      logradouro_tomador: 'Av. B',
      numero_tomador: '200',
      bairro_tomador: 'Batel',
      codigo_municipio_tomador: '4106902',
      cep_tomador: '80420000',
      codigo_municipio_prestacao: '4106902',
      codigo_tributacao_nacional_iss: '040301',
      descricao_servico: 'Laudos de exames de imagem - competência 11/2026',
      valor_servico: 12345.67,
      tributacao_iss: 1,
      tipo_retencao_iss: 1,
      percentual_aliquota_relativa_municipio: 2,
    });
  });

  it('tomador pessoa física vai em cpf_tomador', () => {
    const payload = payloadNfse({
      ...nota,
      tomador: { ...nota.tomador, documento: { tipo: 'cpf', numero: '123.456.789-09' } },
    });
    expect(payload.cpf_tomador).toBe('12345678909');
    expect(payload).not.toHaveProperty('cnpj_tomador');
  });

  it('optante do Simples leva o regime de apuração', () => {
    const payload = payloadNfse({
      ...nota,
      prestador: {
        ...nota.prestador,
        opcaoSimplesNacional: 'me_epp',
        regimeApuracaoSimplesNacional: 1,
      },
    });
    expect(payload).toMatchObject({
      codigo_opcao_simples_nacional: '3',
      regime_tributario_simples_nacional: '1',
    });
  });

  it('o grupo IBS/CBS vai inteiro, com o cIndOp', () => {
    const payload = payloadNfse({
      ...nota,
      servico: { ...nota.servico, codigoNbs: '1.2301.11.00' },
      ibsCbs: {
        codigoIndicadorOperacao: '100301',
        situacaoTributaria: '000',
        classificacaoTributaria: '000001',
        consumidorFinal: false,
        destinatarioDistinto: false,
      },
    });
    expect(payload).toMatchObject({
      codigo_nbs: '123011100',
      finalidade_emissao: 0,
      consumidor_final: 0,
      indicador_destinatario: 0,
      codigo_indicador_operacao: '100301',
      ibs_cbs_situacao_tributaria: '000',
      ibs_cbs_classificacao_tributaria: '000001',
    });
  });

  it('sem IBS/CBS, nenhum campo do grupo vai', () => {
    expect(payloadNfse(nota)).not.toHaveProperty('codigo_indicador_operacao');
  });
});

describe('situacaoDaResposta', () => {
  const base = 'https://homologacao.focusnfe.com.br';

  it('nota autorizada, com o XML em URL absoluta (a Focus manda o caminho relativo)', () => {
    expect(
      situacaoDaResposta(
        {
          ref: 'fat-1',
          status: 'autorizado',
          numero: '42',
          codigo_verificacao: 'ABC',
          data_emissao: '2026-11-27T12:30:00-03:00',
          url: 'https://nfse.gov.br/x',
          url_danfse: 'https://nfse.gov.br/danfse',
          caminho_xml_nota_fiscal: '/arquivos/nfse.xml',
        },
        base,
      ),
    ).toEqual({
      referencia: 'fat-1',
      status: 'autorizada',
      numero: '42',
      codigoVerificacao: 'ABC',
      dataEmissao: new Date('2026-11-27T15:30:00Z'),
      protocolo: null,
      urlNota: 'https://nfse.gov.br/x',
      urlDanfse: 'https://nfse.gov.br/danfse',
      urlXml: 'https://homologacao.focusnfe.com.br/arquivos/nfse.xml',
      urlXmlCancelamento: null,
      erros: [],
    });
  });

  it.each([
    ['processando_autorizacao', 'processando'],
    ['negado', 'negada'],
    ['cancelado', 'cancelada'],
    ['erro_cancelamento', 'erro_cancelamento'],
  ])('status %s vira %s', (status, esperado) => {
    expect(situacaoDaResposta({ ref: 'r', status }, base).status).toBe(esperado);
  });

  it('erro de autorização traz os motivos do portal', () => {
    const situacao = situacaoDaResposta(
      {
        ref: 'r',
        status: 'erro_autorizacao',
        erros: [{ codigo: 'E0310', mensagem: 'Código não existe', correcao: null }],
      },
      base,
    );
    expect(situacao.erros).toEqual([
      { codigo: 'E0310', mensagem: 'Código não existe', correcao: null, campo: null },
    ]);
  });

  it('status desconhecido é resposta inesperada', () => {
    expect(() => situacaoDaResposta({ ref: 'r', status: 'outro' }, base)).toThrow(
      expect.objectContaining({ tipo: 'resposta_inesperada' }),
    );
  });
});

describe('erroDaResposta', () => {
  it('normaliza { codigo, mensagem } da própria API da Focus em erros[]', () => {
    const erro = erroDaResposta(400, {
      codigo: 'empresa_nao_habilitada',
      mensagem: 'Ative a opção habilita_nfsen_producao',
    });
    expect(erro).toMatchObject({ tipo: 'recusada', status: 400 });
    expect(erro.erros).toEqual([
      {
        codigo: 'empresa_nao_habilitada',
        mensagem: 'Ative a opção habilita_nfsen_producao',
        correcao: null,
        campo: null,
      },
    ]);
    expect(erro.message).toContain('Ative a opção habilita_nfsen_producao');
  });

  it('preserva o erros[] (com o campo) do cadastro de empresa', () => {
    const erro = erroDaResposta(422, {
      codigo: 'erro_validacao',
      erros: [
        {
          codigo: 'erro_validacao',
          mensagem: 'Certificado não pertence ao CNPJ informado',
          campo: 'arquivo_certificado_base64',
        },
      ],
    });
    expect(erro.erros).toEqual([
      {
        codigo: 'erro_validacao',
        mensagem: 'Certificado não pertence ao CNPJ informado',
        correcao: null,
        campo: 'arquivo_certificado_base64',
      },
    ]);
  });

  it.each([
    [401, 'credencial'],
    [403, 'credencial'],
    [404, 'nao_encontrado'],
    [429, 'indisponivel'],
    [500, 'indisponivel'],
    [503, 'indisponivel'],
  ])('HTTP %i vira %s', (status, tipo) => {
    expect(erroDaResposta(status, null).tipo).toBe(tipo);
  });

  it('a mensagem de credencial não repete o corpo (HTML do 401)', () => {
    const erro = erroDaResposta(401, null);
    expect(erro.message).toMatch(/FOCUS_NFE_TOKEN/);
  });
});
