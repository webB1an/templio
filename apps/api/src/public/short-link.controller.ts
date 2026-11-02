import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface RedirectResponse {
  redirect: (status: number, url: string) => void;
}

@Controller("r")
export class ShortLinkController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":code")
  async redirect(@Param("code") code: string, @Res() res: RedirectResponse): Promise<void> {
    const shortLink = await this.prisma.shortLink.findUnique({
      where: { code },
      include: { netdiskLink: true },
    });

    const target = shortLink?.netdiskLink;
    if (!shortLink || !target || !target.isActive) {
      throw new NotFoundException("短链不存在或已失效");
    }

    await this.prisma.shortLink
      .update({ where: { code }, data: { clickCount: { increment: 1 } } })
      .catch(() => undefined);

    res.redirect(302, target.url);
  }
}
