import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsString, MaxLength, ValidateIf } from 'class-validator';

/** Texto opcional: nulo ou string até `max` caracteres. */
function TextoOpcional(max: number, descricao?: string, exemplo?: string): PropertyDecorator {
  return (alvo, chave) => {
    ApiProperty({
      type: String,
      nullable: true,
      maxLength: max,
      description: descricao,
      example: exemplo,
    })(alvo, chave);
    ValidateIf((_, v) => v !== null)(alvo, chave);
    IsString()(alvo, chave);
    MaxLength(max)(alvo, chave);
  };
}

/** O que a aba Faturamento do cliente edita. */
export class DadosFiscaisDto {
  @ApiProperty({
    type: [String],
    maxItems: 20,
    example: ['financeiro@cliente.com.br', 'administracao@teleimagem.com.br'],
    description: 'Recebem a NF e os demonstrativos, na ordem; repetidos e vazios saem.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  emailsNf!: string[];

  @TextoOpcional(254, 'E-mail do cadastro no Omie.') email!: string | null;
  @TextoOpcional(200) contatoNome!: string | null;
  @TextoOpcional(60) telefone!: string | null;
  @TextoOpcional(9, 'Só os dígitos são guardados; 8 dígitos.', '01310-100') cep!: string | null;
  @TextoOpcional(300) logradouro!: string | null;
  @TextoOpcional(30) numero!: string | null;
  @TextoOpcional(200) complemento!: string | null;
  @TextoOpcional(200) bairro!: string | null;
  @TextoOpcional(200) cidade!: string | null;
  @TextoOpcional(2, 'Uma das 27 siglas.', 'SP') uf!: string | null;
  @TextoOpcional(10, 'Código FEBRABAN do banco.', '341') bancoCodigo!: string | null;
  @TextoOpcional(20) bancoAgencia!: string | null;
  @TextoOpcional(30) bancoConta!: string | null;

  @ApiProperty({ description: 'Os laudos do cliente saem do faturamento.' })
  @IsBoolean()
  exclusaoFiscal!: boolean;
}

export class DadosFiscaisClienteDto extends DadosFiscaisDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Código do cliente no Omie; vem da sincronização (só leitura).',
  })
  omieCodigoCliente!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  omieSincronizadoEm!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Vazio se o cliente ainda não tem dados de faturamento.',
  })
  atualizadoEm!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Quem salvou por último; vazio na carga do dashboards-one.',
  })
  atualizadoPor!: string | null;
}
