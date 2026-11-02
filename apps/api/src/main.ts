import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// PM2 可能带着空值/旧值环境启动；这里以 apps/api/.env 为准覆盖
loadEnv({ override: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // 公开 API 统一 /api 前缀；/health 保持根路径，供部署健康检查使用
  app.setGlobalPrefix("api", { exclude: ["health"] });
  const allowedOrigins = (process.env.CORS_ORIGINS || process.env.APP_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  app.enableCors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : { origin: false });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`[templio-api] listening on 0.0.0.0:${port}`);
}

void bootstrap();
