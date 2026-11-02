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

    res.redirect(302, withPasscode(target.url, target.passcode));
  }
}

/** 提取码不直接展示给用户，短链跳转时自动带上 pwd（网盘链接已带 pwd 时跳过） */
function withPasscode(rawUrl: string, passcode: string | null): string {
  if (!passcode) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.get("pwd")) url.searchParams.set("pwd", passcode);
    return url.toString();
  } catch {
    return rawUrl;
  }
}
