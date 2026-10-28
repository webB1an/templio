import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, NetdiskType, TemplateFormat, TemplateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NetdiskService } from '../netdisk/netdisk.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';

/** 审核状态机允许的迁移（PRD §5.3） */
const ALLOWED_TRANSITIONS: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ['pending_review'],
  rejected: ['pending_review'],
  pending_review: ['published', 'rejected'],
  published: ['offline'],
  offline: ['pending_review'],
  banned: [], // 封禁态只允许管理端人工处理，不进自动流转
};

const ADMIN_LIST_SELECT = {
  id: true,
  title: true,
  cover: true,
  format: true,
  status: true,
  baseCreditPrice: true,
  viewCount: true,
  favoriteCount: true,
  heatScore: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { category: { select: { id: true, name: true, dimension: true } } } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.TemplateSelect;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly netdisk: NetdiskService,
  ) {}

  async create(dto: CreateTemplateDto, adminId: number) {
    await this.assertCategoriesAndTags(dto.categoryIds, dto.tagIds ?? []);
    const template = await this.prisma.template.create({
      data: {
        title: dto.title,
        summary: dto.summary,
        format: dto.format,
        cover: dto.cover,
        baseCreditPrice: dto.baseCreditPrice ?? 0,
        copyrightSource: dto.copyrightSource,
        authorizationNote: dto.authorizationNote,
        meta: dto.previews ? { previews: dto.previews } : undefined,
        categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { create: (dto.tagIds ?? []).map((tagId) => ({ tagId })) },
        files: { create: dto.files.map((f) => this.mapFile(f)) },
        reviewRecords: {
          create: { adminId, action: 'create', note: '创建草稿' },
        },
      },
    });
    // 创建后立即做分享链接健康检查（失败不阻塞创建）
    await this.checkTemplateFiles(template.id).catch(() => undefined);
    return template;
  }

  async update(id: number, dto: UpdateTemplateDto) {
    const template = await this.mustFind(id);
    // 仅草稿 / 驳回态可编辑
    if (!['draft', 'rejected'].includes(template.status)) {
      throw new ConflictException(`当前状态 ${template.status} 不可编辑，仅 draft/rejected 可编辑`);
    }
    if (dto.categoryIds || dto.tagIds) {
      await this.assertCategoriesAndTags(dto.categoryIds ?? [], dto.tagIds ?? []);
    }
    const { categoryIds, tagIds, files, previews, ...rest } = dto;
    await this.prisma.$transaction(async (tx) => {
      if (categoryIds) {
        await tx.templateCategory.deleteMany({ where: { templateId: id } });
        await tx.templateCategory.createMany({
          data: categoryIds.map((categoryId) => ({ templateId: id, categoryId })),
        });
      }
      if (tagIds) {
        await tx.templateTag.deleteMany({ where: { templateId: id } });
        await tx.templateTag.createMany({
          data: tagIds.map((tagId) => ({ templateId: id, tagId })),
        });
      }
      if (files) {
        await tx.templateFile.deleteMany({ where: { templateId: id } });
        await tx.templateFile.createMany({
          data: files.map((f) => ({ ...this.mapFile(f), templateId: id })),
        });
      }
      await tx.template.update({
        where: { id },
        data: {
          ...rest,
          meta: previews ? { previews } : undefined,
        },
      });
    });
    // 文件有变更时重新检查分享链接（失败不阻塞更新）
    if (files) await this.checkTemplateFiles(id).catch(() => undefined);
    return this.mustFind(id);
  }

  /** 提审：draft / rejected / offline → pending_review；发布前校验完整性 */
  async submit(id: number, adminId: number) {
    const template = await this.mustFind(id);
    this.assertTransition(template.status, TemplateStatus.pending_review);
    await this.assertCompleteness(id);
    return this.prisma.template.update({
      where: { id },
      data: {
        status: TemplateStatus.pending_review,
        rejectReason: null,
        reviewRecords: { create: { adminId, action: 'submit', note: '提交审核' } },
      },
    });
  }

  /** 审核：pending_review → published / rejected */
  async review(id: number, adminId: number, action: 'approve' | 'reject', note?: string) {
    const template = await this.mustFind(id);
    const target =
      action === 'approve' ? TemplateStatus.published : TemplateStatus.rejected;
    this.assertTransition(template.status, target);
    if (action === 'reject' && !note) {
      throw new BadRequestException('驳回必须填写原因');
    }
    return this.prisma.template.update({
      where: { id },
      data: {
        status: target,
        rejectReason: action === 'reject' ? note : null,
        publishedAt: action === 'approve' ? new Date() : template.publishedAt,
        reviewRecords: {
          create: { adminId, action, note: note ?? '审核通过' },
        },
      },
    });
  }

  /** 下架：published → offline（投诉下架 / 主动下架共用） */  async offline(id: number, adminId: number, note?: string) {
    const template = await this.mustFind(id);
    this.assertTransition(template.status, TemplateStatus.offline);
    return this.prisma.template.update({
      where: { id },
      data: {
        status: TemplateStatus.offline,
        reviewRecords: { create: { adminId, action: 'offline', note: note ?? '下架' } },
      },
    });
  }

  async list(query: {
    status?: string;
    format?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.TemplateWhereInput = {
      ...(query.status && Object.values(TemplateStatus).includes(query.status as TemplateStatus)
        ? { status: query.status as TemplateStatus }
        : {}),
      ...(query.format && Object.values(TemplateFormat).includes(query.format as TemplateFormat)
        ? { format: query.format as TemplateFormat }
        : {}),
      ...(query.keyword
        ? { title: { contains: query.keyword } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.template.findMany({
        where,
        select: ADMIN_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.template.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** 详情：包含网盘分享链接（仅此接口返回）与审核记录 */
  async detail(id: number) {
    const template = await this.prisma.template.findUnique({
      where: { id },
      include: {
        files: {
          select: {
            id: true,
            filename: true,
            format: true,
            size: true,
            netdiskType: true,
            netdiskFileId: true,
            previewUrl: true,
            shareUrl: true,
            checkStatus: true,
            checkMessage: true,
            checkAt: true,
            createdAt: true,
          },
        },
        categories: { select: { category: { select: { id: true, name: true, dimension: true } } } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
        reviewRecords: {
          select: { id: true, adminId: true, action: true, note: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!template) throw new NotFoundException('模板不存在');
    return template;
  }

  /** 删除：仅 draft / rejected 可删（published 用下架） */
  async remove(id: number) {
    const template = await this.mustFind(id);
    if (!['draft', 'rejected'].includes(template.status)) {
      throw new ConflictException('已发布/下架模板不可删除，请使用下架操作');
    }
    await this.prisma.template.delete({ where: { id } });
    return { deleted: true };
  }

  /** 手动触发：重新检查某模板全部文件的分享链接 */
  async checkFiles(id: number) {
    await this.mustFind(id);
    const results = await this.checkTemplateFiles(id);
    return { checked: results.length, results };
  }

  /** 逐个检查模板文件的分享链接并落库，返回检查结果 */
  private async checkTemplateFiles(templateId: number) {
    const files = await this.prisma.templateFile.findMany({
      where: { templateId },
      select: { id: true, netdiskType: true, shareUrl: true },
    });
    const results: Array<{ fileId: number; status: string; message: string }> = [];
    for (const file of files) {
      let status = 'unknown';
      let message = '检查失败';
      try {
        const r = await this.netdisk.checkShare(file.netdiskType, file.shareUrl);
        status = r.status;
        message = r.message;
      } catch (e) {
        message = (e as Error).message.slice(0, 500);
      }
      await this.prisma.templateFile.update({
        where: { id: file.id },
        data: { checkStatus: status, checkMessage: message, checkAt: new Date() },
      });
      results.push({ fileId: file.id, status, message });
    }
    return results;
  }

  private async mustFind(id: number) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('模板不存在');
    return template;
  }

  private assertTransition(from: TemplateStatus, to: TemplateStatus) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(`状态不允许流转：${from} → ${to}`);
    }
  }

  /** 提审完整性：封面必填、至少 1 个文件、至少 1 个分类（PRD §4.4/§5） */
  private async assertCompleteness(id: number) {
    const template = await this.prisma.template.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { files: true, categories: true } } },
    });
    if (!template.cover) throw new BadRequestException('提审前必须设置封面图');
    if (template._count.files < 1) throw new BadRequestException('至少需要 1 个网盘文件');
    if (template._count.categories < 1) throw new BadRequestException('至少需要 1 个分类');
  }

  private async assertCategoriesAndTags(categoryIds: number[], tagIds: number[]) {
    if (categoryIds.length) {
      const count = await this.prisma.category.count({
        where: { id: { in: categoryIds }, enabled: true },
      });
      if (count !== categoryIds.length) {
        throw new BadRequestException('存在无效或已停用的分类');
      }
    }
    if (tagIds.length) {
      const count = await this.prisma.tag.count({ where: { id: { in: tagIds } } });
      if (count !== tagIds.length) throw new BadRequestException('存在无效标签');
    }
  }

  private mapFile(f: {
    filename: string;
    netdiskType: NetdiskType;
    shareUrl: string;
    netdiskFileId?: string;
    size?: number;
    previewUrl?: string;
  }) {
    return {
      filename: f.filename,
      netdiskType: f.netdiskType,
      shareUrl: f.shareUrl,
      netdiskFileId: f.netdiskFileId,
      size: f.size != null ? BigInt(f.size) : null,
      previewUrl: f.previewUrl,
    };
  }
}
