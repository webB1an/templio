import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{
    ok: boolean;
    service: string;
    version: string;
    commit: string;
    db: string;
    latencyMs: number;
    timestamp: string;
  }> {
    const startedAt = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      service: "templio-api",
      version: process.env.APP_VERSION || "0.1.0",
      commit: process.env.GIT_SHA || "dev",
      db: "ok",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}
