import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminJwtPayload } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

const VALID_STATUSES = ['pending', 'resolved', 'rejected'] as const;

class HandleComplaintDto {
  @IsIn(VALID_STATUSES)
  status!: (typeof VALID_STATUSES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 1024)
  resolution?: string;
}

@Injectable()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/complaints')
export class ComplaintsController {
  constructor(private readonly prisma: PrismaService) {}

  /** 投诉列表（状态筛选 + 分页） */
  @Get()
  async list(@Query('status') status?: string, @Query('page') page?: string) {
    const p = Number(page) > 0 ? Number(page) : 1;
    const where = status && VALID_STATUSES.includes(status as never) ? { status: status as never } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.complaint.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (p - 1) * 20,
        take: 20,
        include: { template: { select: { id: true, title: true } } },
      }),
      this.prisma.complaint.count({ where }),
    ]);
    return { items, total, page: p, pageSize: 20 };
  }

  /** 处理投诉：标记 resolved / rejected，可附处理说明 */
  @Patch(':id')
  async handle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandleComplaintDto,
    @Req() req: { admin: AdminJwtPayload },
  ) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException('投诉不存在');
    return this.prisma.complaint.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: dto.resolution ?? null,
        handledBy: req.admin.sub,
      },
    });
  }
}

@Module({
  controllers: [ComplaintsController],
})
export class ComplaintsModule {}
