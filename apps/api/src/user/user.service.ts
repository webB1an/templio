import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PublicTemplatesService } from "../public/templates.service";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicTemplates: PublicTemplatesService,
  ) {}

  async me(userId: string): Promise<{
    id: string;
    nickname: string | null;
    avatar: string | null;
    createdAt: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("用户不存在");
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async listFavorites(userId: string): Promise<{ items: unknown[]; total: number }> {
    const rows = await this.prisma.userFavorite.findMany({
      where: { userId, template: { status: "published" } },
      orderBy: { createdAt: "desc" },
      include: {
        template: {
          include: {
            category: true,
            files: { orderBy: { seq: "asc" } },
            tags: { include: { tag: true }, orderBy: { sort: "asc" } },
            netdiskLinks: {
              where: { isActive: true },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              include: { shortLinks: true },
            },
          },
        },
      },
    });

    return {
      items: rows.map((row) => ({
        ...this.publicTemplates.toDto(row.template),
        favoritedAt: row.createdAt.toISOString(),
      })),
      total: rows.length,
    };
  }

  async favoriteStatus(userId: string, templateId: string): Promise<{ favorited: boolean }> {
    if (!templateId) throw new BadRequestException("缺少模板 id");
    const record = await this.prisma.userFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
    return { favorited: Boolean(record) };
  }

  async addFavorite(
    userId: string,
    templateId: string,
  ): Promise<{ favorited: boolean; favoriteCount: number }> {
    if (!templateId) throw new BadRequestException("缺少模板 id");
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, status: "published" },
      select: { id: true, favoriteCount: true },
    });
    if (!template) throw new NotFoundException("模板不存在或未上架");

    const existing = await this.prisma.userFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
    if (!existing) {
      await this.prisma.$transaction([
        this.prisma.userFavorite.create({ data: { userId, templateId } }),
        this.prisma.template.update({
          where: { id: templateId },
          data: { favoriteCount: { increment: 1 } },
        }),
      ]);
    }
    const count = await this.prisma.template.findUnique({
      where: { id: templateId },
      select: { favoriteCount: true },
    });
    return { favorited: true, favoriteCount: count?.favoriteCount || 0 };
  }

  async removeFavorite(
    userId: string,
    templateId: string,
  ): Promise<{ favorited: boolean; favoriteCount: number }> {
    if (!templateId) throw new BadRequestException("缺少模板 id");
    const existing = await this.prisma.userFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.userFavorite.delete({
          where: { userId_templateId: { userId, templateId } },
        }),
        this.prisma.template.update({
          where: { id: templateId },
          data: { favoriteCount: { decrement: 1 } },
        }),
      ]);
    }
    const count = await this.prisma.template.findUnique({
      where: { id: templateId },
      select: { favoriteCount: true },
    });
    return { favorited: false, favoriteCount: Math.max(0, count?.favoriteCount || 0) };
  }
}
