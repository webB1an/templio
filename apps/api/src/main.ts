import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // 公开 API 统一 /api 前缀；/health 保持根路径，供部署健康检查使用
  app.setGlobalPrefix("api", { exclude: ["health"] });
  app.enableCors();
  app.enableShutdownHooks();

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`[templio-api] listening on 0.0.0.0:${port}`);
}

void bootstrap();
