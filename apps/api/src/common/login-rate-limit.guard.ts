import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

interface RateLimitRequest {
  ip?: string;
  headers?: Record<string, string | undefined>;
}

/**
 * 登录接口简单内存限流：同一 IP 每分钟最多 10 次。
 * 单进程部署（PM2 fork 1 实例）足够；多实例时应换 Redis/数据库。
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly windowMs = 60_000;
  private readonly maxAttempts = 10;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const forwarded = (request.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = forwarded || request.ip || "unknown";
    const now = Date.now();

    const current = this.hits.get(ip);
    if (!current || current.resetAt <= now) {
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs });
      this.cleanup(now);
      return true;
    }

    current.count += 1;
    if (current.count > this.maxAttempts) {
      throw new HttpException("登录尝试过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private cleanup(now: number): void {
    if (this.hits.size < 1000) return;
    for (const [key, value] of this.hits) {
      if (value.resetAt <= now) this.hits.delete(key);
    }
  }
}
