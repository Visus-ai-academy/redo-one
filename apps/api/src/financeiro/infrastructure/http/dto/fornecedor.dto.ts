import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';
import {
  TIPOS_CHAVE_PIX,
  TIPOS_PESSOA,
  type TipoChavePix,
  type TipoPessoa,
} from '../../../domain/fornecedor';
import { ListarFinanceiroDto } from './comum.dto';

const TIPO_PESSOA = { enum: TIPOS_PESSOA, enumName: 'TipoPessoaFornecedor' };
const TIPO_PIX = { enum: TIPOS_CHAVE_PIX, enumName: 'TipoChavePixFornecedor' };

const texto = (max: number, exemplo?: string) => ({
  type: String,
  nullable: true,
  maxLength: max,
  ...(exemplo ? { example: exemplo } : {}),
});

export class ListarFornecedoresDto extends ListarFinanceiroDto {
  @ApiProperty({
    description: 'Id da categoria padrão ou `todas` (escolha explícita; nunca vazio).',
    example: 'todas',
  })
  @ValidateIf((o: ListarFornecedoresDto) => o.categoria !== 'todas')
  @IsUUID()
  categoria!: string;
}

/** Corpo de criar e editar fornecedor. */
export class FornecedorDto {
  @ApiProperty(TIPO_PESSOA)
  @IsIn(TIPOS_PESSOA)
  tipoPessoa!: TipoPessoa;

  @ApiProperty({ example: 'Ômega Serviços Contábeis Ltda.', maxLength: 200 })
  @Transform(aparar)
  @IsString()
  @MaxLength(200)
  razaoSocial!: string;

  @ApiPropertyOptional(texto(200))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeFantasia: string | null = null;

  @ApiPropertyOptional(texto(18, '12.345.678/0001-90'))
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj: string | null = null;

  @ApiPropertyOptional(texto(14, '123.456.789-09'))
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf: string | null = null;

  @ApiPropertyOptional(texto(200))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email: string | null = null;

  @ApiPropertyOptional(texto(20))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone: string | null = null;

  @ApiPropertyOptional(texto(9))
  @IsOptional()
  @IsString()
  @MaxLength(9)
  cep: string | null = null;

  @ApiPropertyOptional(texto(200))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  logradouro: string | null = null;

  @ApiPropertyOptional(texto(20))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero: string | null = null;

  @ApiPropertyOptional(texto(100))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complemento: string | null = null;

  @ApiPropertyOptional(texto(100))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bairro: string | null = null;

  @ApiPropertyOptional(texto(100))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cidade: string | null = null;

  @ApiPropertyOptional(texto(2, 'SP'))
  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf: string | null = null;

  @ApiPropertyOptional({ ...TIPO_PIX, nullable: true })
  @IsOptional()
  @IsIn(TIPOS_CHAVE_PIX)
  tipoChavePix: TipoChavePix | null = null;

  @ApiPropertyOptional(texto(100))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  chavePix: string | null = null;

  @ApiPropertyOptional(texto(3, '341'))
  @IsOptional()
  @IsString()
  @MaxLength(3)
  bancoCodigo: string | null = null;

  @ApiPropertyOptional(texto(10))
  @IsOptional()
  @IsString()
  @MaxLength(10)
  agencia: string | null = null;

  @ApiPropertyOptional(texto(20))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  conta: string | null = null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Categoria de despesa.',
  })
  @IsOptional()
  @IsUUID()
  categoriaPadraoId: string | null = null;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;

  @ApiPropertyOptional(texto(2000))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes: string | null = null;
}

export class FornecedorItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty(TIPO_PESSOA) tipoPessoa!: TipoPessoa;
  @ApiProperty() razaoSocial!: string;
  @ApiProperty({ type: String, nullable: true }) nomeFantasia!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Só dígitos.' }) cnpj!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Os dois últimos dígitos do CPF (LGPD: a lista não mostra o CPF inteiro).',
  })
  cpfFinal!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) categoriaPadraoId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '"Grupo › Categoria".' })
  categoriaPadraoNome!: string | null;
  @ApiProperty() ativo!: boolean;
}

export class FornecedorDetalheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty(TIPO_PESSOA) tipoPessoa!: TipoPessoa;
  @ApiProperty() razaoSocial!: string;
  @ApiProperty({ type: String, nullable: true }) nomeFantasia!: string | null;
  @ApiProperty({ type: String, nullable: true }) cnpj!: string | null;
  @ApiProperty({ type: String, nullable: true }) cpf!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) telefone!: string | null;
  @ApiProperty({ type: String, nullable: true }) cep!: string | null;
  @ApiProperty({ type: String, nullable: true }) logradouro!: string | null;
  @ApiProperty({ type: String, nullable: true }) numero!: string | null;
  @ApiProperty({ type: String, nullable: true }) complemento!: string | null;
  @ApiProperty({ type: String, nullable: true }) bairro!: string | null;
  @ApiProperty({ type: String, nullable: true }) cidade!: string | null;
  @ApiProperty({ type: String, nullable: true }) uf!: string | null;
  @ApiProperty({ ...TIPO_PIX, nullable: true }) tipoChavePix!: TipoChavePix | null;
  @ApiProperty({ type: String, nullable: true }) chavePix!: string | null;
  @ApiProperty({ type: String, nullable: true }) bancoCodigo!: string | null;
  @ApiProperty({ type: String, nullable: true }) agencia!: string | null;
  @ApiProperty({ type: String, nullable: true }) conta!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) categoriaPadraoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoriaPadraoNome!: string | null;
  @ApiProperty() ativo!: boolean;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
}

export class PaginaFornecedoresDto {
  @ApiProperty({ type: [FornecedorItemDto] }) itens!: FornecedorItemDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}
