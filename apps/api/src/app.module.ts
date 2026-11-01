import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AppController, HealthController],
})
export class AppModule {}
