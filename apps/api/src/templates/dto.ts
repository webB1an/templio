import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NetdiskType, TemplateFormat } from '@prisma/client';

export class TemplateFileInputDto {
  @IsString()
  @Length(1, 256)
  filename!: string;

  @IsEnum(NetdiskType)
  netdiskType!: NetdiskType;

  /** 网盘分享链接（自带提取码）。仅详情权限接口返回，绝不进列表/日志 */
  @IsString()
  @Length(1, 1024)
  shareUrl!: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  netdiskFileId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  previewUrl?: string;
}

export class CreateTemplateDto {
  @IsString()
  @Length(1, 128)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  summary?: string;

  @IsEnum(TemplateFormat)
  format!: TemplateFormat;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  cover?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  previews?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 256)
  copyrightSource?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  authorizationNote?: string;

  /** 建议积分数（AI 生成或手动输入），0 = 免费 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  baseCreditPrice?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  categoryIds!: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  tagIds?: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TemplateFileInputDto)
  files!: TemplateFileInputDto[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  summary?: string;

  @IsOptional()
  @IsEnum(TemplateFormat)
  format?: TemplateFormat;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  cover?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  previews?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 256)
  copyrightSource?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  authorizationNote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  baseCreditPrice?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  categoryIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  tagIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TemplateFileInputDto)
  files?: TemplateFileInputDto[];
}

export class ReviewDto {
  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';

  /** 驳回时必填，告知驳回原因 */
  @IsOptional()
  @IsString()
  @Length(0, 256)
  note?: string;
}

/** 批量审核（仅 pending_review 可 approve/reject；批量提审复用单条 submit 逐个调用） */
export class BatchReviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  ids!: number[];

  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @Length(0, 256)
  note?: string;
}

export class ListTemplateQueryDto {  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;
}
