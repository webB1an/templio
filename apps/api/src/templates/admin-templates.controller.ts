import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTemplateDto, ListTemplateQueryDto, ReviewDto, UpdateTemplateDto } from './dto';
import { TemplatesService } from './templates.service';

interface AdminReq {
  admin: { sub: number; role: string };
}

/** 管理端模板管理与审核流 */
@Controller('admin/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  create(@Body() dto: CreateTemplateDto, @Req() req: AdminReq) {
    return this.templates.create(dto, req.admin.sub);
  }

  @Get()
  list(@Query() query: ListTemplateQueryDto) {
    return this.templates.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.templates.detail(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.templates.remove(id);
  }

  @Post(':id/submit')
  submit(@Param('id', ParseIntPipe) id: number, @Req() req: AdminReq) {
    return this.templates.submit(id, req.admin.sub);
  }

  @Post(':id/review')
  review(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewDto, @Req() req: AdminReq) {
    return this.templates.review(id, req.admin.sub, dto.action, dto.note);
  }

  @Post(':id/offline')
  offline(@Param('id', ParseIntPipe) id: number, @Body() body: { note?: string }, @Req() req: AdminReq) {
    return this.templates.offline(id, req.admin.sub, body?.note);
  }
}
