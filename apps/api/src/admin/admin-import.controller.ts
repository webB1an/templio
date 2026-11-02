import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { AdminAuthGuard } from "./auth.guard";
import { AdminImportService } from "./admin-import.service";

interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller("admin/import")
@UseGuards(AdminAuthGuard)
export class AdminImportController {
  constructor(private readonly imports: AdminImportService) {}

  @Post("package")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "cover", maxCount: 1 },
        { name: "thumb", maxCount: 1 },
        { name: "previews", maxCount: 8 },
      ],
      { limits: { fileSize: 20 * 1024 * 1024, files: 10 } },
    ),
  )
  importPackage(
    @UploadedFiles() files: Record<string, UploadedImage[] | undefined>,
    @Body() body: { manifest?: string; text?: string },
  ) {
    return this.imports.importPackage(files, body.manifest, body.text);
  }
}
