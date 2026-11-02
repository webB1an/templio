import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./auth.guard";
import { StorageAccountService } from "./netdisk/storage-account.service";

@Controller("admin/storage-accounts")
@UseGuards(AdminAuthGuard)
export class StorageController {
  constructor(private readonly accounts: StorageAccountService) {}

  @Get()
  list() {
    return this.accounts.listAccounts();
  }

  @Post()
  create(@Body() body: { provider: unknown; label: unknown; isDefault?: unknown }) {
    return this.accounts.createAccount(body);
  }

  @Patch(":id")
  updateLabel(@Param("id") id: string, @Body() body: { label?: unknown }) {
    return this.accounts.updateLabel(id, body.label);
  }

  @Post(":id/default")
  setDefault(@Param("id") id: string) {
    return this.accounts.setDefaultAccount(id);
  }

  @Post(":id/probe")
  probe(@Param("id") id: string) {
    return this.accounts.probeAccount(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.accounts.deleteAccount(id);
  }

  @Post(":id/baidu-cookie")
  saveBaiduCookie(@Param("id") id: string, @Body() body: { cookie?: unknown }) {
    return this.accounts.saveBaiduCookie(id, body.cookie);
  }

  @Post(":id/quark-auth/start")
  startQuarkAuth(@Param("id") id: string) {
    return this.accounts.startQuarkAuth(id);
  }

  @Post(":id/quark-auth/finish")
  finishQuarkAuth(@Param("id") id: string, @Body() body: { code?: unknown }) {
    return this.accounts.finishQuarkAuth(id, body.code);
  }
}
