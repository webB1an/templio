import { Body, Controller, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserAuthService } from "./user-auth.service";

interface ClickRequest {
  headers?: Record<string, string | undefined>;
}

@Controller("templates")
export class TemplateClickController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: UserAuthService,
  ) {}

  @Post(":id/click")
  async click(
    @Param("id") id: string,
    @Body() body: { kind?: unknown },
    @Req() request: ClickRequest,
  ): Promise<{ recorded: boolean; kind: string }> {
    const kind = body.kind === "copy" ? "copy" : "view";
    const template = await this.prisma.template.findFirst({
      where: { id, status: "published" },
      select: { id: true },
    });
    if (!template) throw new NotFoundException("模板不存在或已下架");

    let userId: string | undefined;
    const header = request.headers?.authorization || "";
    if (header.startsWith("Bearer ")) {
      try {
        userId = this.auth.verify(header.slice("Bearer ".length).trim()).sub;
      } catch {
        userId = undefined;
      }
    }

    await this.prisma.$transaction([
      this.prisma.template.update({
        where: { id },
        data:
          kind === "copy"
            ? { copyCount: { increment: 1 } }
            : { viewCount: { increment: 1 } },
      }),
      this.prisma.templateClick.create({
        data: { templateId: id, kind, userId: userId || null },
      }),
    ]);

    return { recorded: true, kind };
  }
}
