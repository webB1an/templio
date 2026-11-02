import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicModule } from "./public/public.module";

@Module({
  imports: [PrismaModule, PublicModule],
  controllers: [AppController, HealthController],
})
export class AppModule {}
