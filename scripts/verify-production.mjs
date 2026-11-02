#!/usr/bin/env node
/**
 * 生产验收脚本：一键检查线上全链路。
 *
 * 用法：
 *   npm run verify:prod
 *   TEMPLIO_ADMIN_PASSWORD=xxx npm run verify:prod
 *   node scripts/verify-production.mjs --base https://templio.wdbzk.com --skip-admin
 *
 * 环境变量：
 *   TEMPLIO_ADMIN_USERNAME（默认 admin）
 *   TEMPLIO_ADMIN_PASSWORD（不提供则跳过管理端登录检查）
 */
const args = parseArgs(process.argv.slice(2));
const base = (args.base || process.env.TEMPLIO_BASE || "https://templio.wdbzk.com").replace(/\/+$/, "");
const adminUser = args["admin-user"] || process.env.TEMPLIO_ADMIN_USERNAME || "admin";
const adminPassword = process.env.TEMPLIO_ADMIN_PASSWORD || "";
const skipAdmin = Boolean(args["skip-admin"]) || !adminPassword;
const skipWechat = Boolean(args["skip-wechat"]);

const checks = [];
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail: detail || "" });
    console.log(`✔ ${name}${detail ? `：${detail}` : ""}`);
  } catch (error) {
    failed += 1;
    checks.push({ name, ok: false, detail: error.message });
    console.log(`✘ ${name}：${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeout || 15000),
  });
  return response;
}

async function json(path, options) {
  const response = await request(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${body && body.message ? `：${body.message}` : ""}`);
  }
  return body;
}

async function main() {
  console.log(`模板宝生产验收：${base}\n`);

  await check("health", async () => {
    const body = await json("/health");
    expect(body && body.ok === true, "health 返回非 ok");
    expect(body.db === "ok", "数据库不健康");
    return `v${body.version || "?"} @ ${String(body.commit || "dev").slice(0, 7)} · db=${body.db}`;
  });

  let firstTemplate = null;
  await check("公开模板列表", async () => {
    const body = await json("/api/templates?limit=10");
    expect(Array.isArray(body.items), "items 不是数组");
    expect(body.items.length > 0, "没有已上架模板");
    firstTemplate = body.items[0];
    return `total=${body.total}`;
  });

  await check("分类聚合", async () => {
    const body = await json("/api/templates/facets");
    expect(Array.isArray(body.categories) && body.categories.length > 0, "分类为空");
    return `${body.categories.length} 个分类`;
  });

  await check("搜索", async () => {
    const body = await json("/api/templates?q=%E5%90%88%E5%90%8C&limit=5");
    expect(Array.isArray(body.items), "搜索 items 异常");
    return `${body.items.length} 条结果`;
  });

  if (firstTemplate) {
    await check("模板详情", async () => {
      const body = await json(`/api/templates/${firstTemplate.id}`);
      expect(body.id === firstTemplate.id, "详情 id 不匹配");
      return body.title;
    });

    if (firstTemplate.coverUrl) {
      await check("封面图片", async () => {
        const response = await request(new URL(firstTemplate.coverUrl).pathname);
        expect(response.ok, `HTTP ${response.status}`);
        const type = response.headers.get("content-type") || "";
        expect(type.startsWith("image/"), `content-type=${type}`);
        return `${response.headers.get("content-length") || "?"} bytes`;
      });
    }

    if (firstTemplate.shortLink) {
      await check("短链跳转", async () => {
        const response = await request(new URL(firstTemplate.shortLink).pathname, { redirect: "manual" });
        expect([301, 302, 307, 308].includes(response.status), `status=${response.status}`);
        const location = response.headers.get("location") || "";
        expect(/^https?:\/\//.test(location), `location=${location}`);
        return `${response.status} → ${new URL(location).host}`;
      });
    }
  }

  await check("管理端页面", async () => {
    const response = await request("/admin/");
    expect(response.ok, `HTTP ${response.status}`);
    const html = await response.text();
    expect(html.includes("模板宝"), "页面未包含品牌名");
    return "HTTP 200";
  });

  await check("管理端入口重定向", async () => {
    const response = await request("/admin", { redirect: "manual" });
    expect([301, 302, 307, 308].includes(response.status), `status=${response.status}`);
    return `${response.status} → ${response.headers.get("location") || ""}`;
  });

  await check("未登录管理接口保护", async () => {
    const response = await request("/api/admin/templates");
    expect(response.status === 401, `status=${response.status}`);
    return "401";
  });

  await check("未登录收藏接口保护", async () => {
    const response = await request("/api/user/favorites");
    expect(response.status === 401, `status=${response.status}`);
    return "401";
  });

  if (!skipWechat) {
    await check("微信登录链路", async () => {
      const response = await request("/api/user/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "verify-fake-code" }),
      });
      const body = await response.json().catch(() => null);
      expect(response.status === 401, `status=${response.status}`);
      expect(
        body && typeof body.message === "string" && /微信登录失败/.test(body.message),
        `message=${body && body.message}`
      );
      return "已连通微信接口（fake code 被拒）";
    });
  }

  if (skipAdmin) {
    console.log("\n↷ 未提供 TEMPLIO_ADMIN_PASSWORD，跳过管理端登录检查");
  } else {
    let adminToken = "";
    await check("管理端登录", async () => {
      const body = await json("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: adminUser, password: adminPassword }),
      });
      expect(typeof body.token === "string" && body.token.length > 20, "未返回 token");
      adminToken = body.token;
      return "token ok";
    });

    if (adminToken) {
      await check("管理端概览", async () => {
        const body = await json("/api/admin/stats", {
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(typeof body.total === "number", "total 异常");
        return `total=${body.total} / pending=${body.pendingReview}`;
      });

      await check("管理端模板列表", async () => {
        const body = await json("/api/admin/templates?limit=5", {
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(Array.isArray(body.items), "items 异常");
        return `${body.total} 条`;
      });
    }
  }

  console.log(`\n验收结果：${checks.length - failed}/${checks.length} 通过`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`✘ 验收脚本异常：${error.message}`);
  process.exit(1);
});

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
