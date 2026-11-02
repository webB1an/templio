import { Button, Card, message, Typography } from "antd";

const COMMAND = `# 1. 渲染物料包（Windows 桌面，需要 LibreOffice）
templio render D:\\templates -o D:\\templates-dist

# 2. 上传到服务端（密码建议用环境变量，避免出现在命令行历史）
set TEMPLIO_ADMIN_PASSWORD=服务器 .env 中的 ADMIN_PASSWORD
templio upload D:\\templates-dist --api https://templio.wdbzk.com

# 可选：同时把源文件暂存到服务器，方便后续同步网盘
templio upload D:\\templates-dist --api https://templio.wdbzk.com --with-source`;

const STEPS = [
  "桌面端执行 templio render，把 PPT / Word 渲染成标准物料包（封面/缩略图/预览图 + manifest.json）",
  "执行 templio upload，把物料包上传到服务端导入接口",
  "回到「模板库」，筛选状态=已导入；可点「AI」让 DeepSeek 生成标题/分类/标签/简介，确认后应用",
  "点「网盘」补齐分享链接/提取码（自动生成短链），最后点「上架」"
];

export default function ImportPage() {
  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      message.success("命令已复制");
    } catch {
      message.error("复制失败，请手动选择复制");
    }
  };

  return (
    <div>
      <Card title="导入模板（桌面 CLI）" className="panel-card">
        <ol className="import-steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
          导入后的模板状态为「已导入」；先在模板库点「网盘」补齐分享链接和提取码（保存后自动生成短链），再点「上架」，小程序详情页即可复制下载链接。
        </Typography.Paragraph>

        <pre className="cmd-block">{COMMAND}</pre>
        <Button onClick={() => void copyCommand()}>复制命令</Button>
      </Card>

      <Card title="当前链路说明" className="panel-card">
        <ul className="import-notes">
          <li>物料包唯一键是源文件 SHA-256，重复上传会被服务端识别为 duplicate，不会重复创建。</li>
          <li>封面/缩略图/预览图保存到服务器 <code>storage/public/templates/&lt;hash8&gt;/</code>，由 Nginx <code>/assets/</code> 直出。</li>
          <li>加 <code>--with-source</code> 会把源文件暂存到 <code>storage/private/sources/&lt;hash8&gt;/</code>；在「网盘」弹窗可下载/删除，确认已上传网盘后务必删除服务器源文件。</li>
          <li>AI 自动生成标题/分类是下一步；当前导入标题来自 manifest 的 titleGuess。</li>
        </ul>
      </Card>
    </div>
  );
}
