import {
  IsArray,
  IsBoolean,
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

/** 批量导入的单条网盘文件（文件名可缺省，AI 补全后自动回填） */
export class QuickImportFileDto {
  @IsOptional()
  @IsString()
  @Length(0, 256)
  filename?: string;

  @IsEnum(NetdiskType)
  netdiskType!: NetdiskType;

  @IsString()
  @Length(1, 1024)
  shareUrl!: string;
}

/**
 * 快速建档（批量导入单条）：
 * 创建草稿 → AI 全自动补全（标题/摘要/分类/标签/定价直接应用）→ 分享链接检查 → 可选自动提审
 */
export class QuickImportDto {
  /** 封面图 URL（必填，先经 /admin/uploads/image 上传） */
  @IsString()
  @Length(1, 512)
  coverUrl!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  previewUrls?: string[];

  /** 兜底标题（通常是文件名）；AI 成功后被覆盖 */
  @IsOptional()
  @IsString()
  @Length(0, 128)
  title?: string;

  /** 模板格式；缺省时按文件名扩展名推断，无法推断为 other */
  @IsOptional()
  @IsEnum(TemplateFormat)
  format?: TemplateFormat;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => QuickImportFileDto)
  files!: QuickImportFileDto[];

  /** 是否调用 AI 自动补全（默认 true） */
  @IsOptional()
  @IsBoolean()
  useAi?: boolean;

  /** 信息完整时自动提审（默认 true）；发布仍需人工审核通过 */
  @IsOptional()
  @IsBoolean()
  autoSubmit?: boolean;
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
