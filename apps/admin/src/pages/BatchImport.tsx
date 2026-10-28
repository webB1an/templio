import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Image,
  Input,
  Progress,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { PlayCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { api } from '../api';
import { FORMAT_OPTIONS } from '../types';

interface ParsedLink {
  filename?: string;
  netdiskType: 'quark' | 'baidu';
  shareUrl: string;
}

interface ImportResult {
  key: number;
  cover: string;
  ok: boolean;
  id?: number;
  title?: string;
  status?: string;
  aiApplied?: boolean;
  aiError?: string;
  submitError?: string;
  error?: string;
}

/** 从一行文本解析出网盘文件：支持「文件名 链接」或纯链接；同行多个链接拆成多个文件 */
function parseLine(line: string): ParsedLink[] {
  const urlRe = /(https?:\/\/[^\s，,]+)/g;
  const urls = line.match(urlRe) ?? [];
  if (urls.length === 0) return [];
  const namePart = line.split(urlRe)[0]?.trim();
  return urls.map((u) => ({
    filename: urls.length === 1 ? namePart || undefined : undefined,
    netdiskType: u.includes('pan.baidu.com') ? 'baidu' : 'quark',
    shareUrl: u,
  }));
}

export function BatchImport() {
  const [step, setStep] = useState(0);
  const [coverList, setCoverList] = useState<UploadFile[]>([]);
  const [coverUrls, setCoverUrls] = useState<string[]>([]);
  const [linksText, setLinksText] = useState('');
  const [defaultFormat, setDefaultFormat] = useState<string | undefined>();
  const [useAi, setUseAi] = useState(true);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);

  const parsedLinks = useMemo(
    () => linksText.split('\n').flatMap((l) => parseLine(l.trim())).filter((l) => l.shareUrl),
    [linksText],
  );

  const coverUpload = {
    multiple: true,
    accept: 'image/*',
    listType: 'picture-card' as const,
    fileList: coverList,
    customRequest: (opts: { file: unknown; onSuccess?: (b: string) => void; onError?: (e: Error) => void }) => {
      const fd = new FormData();
      fd.append('file', opts.file as File);
      api
        .upload<{ url: string }>('/admin/uploads/image', fd)
        .then((res) => {
          setCoverUrls((prev) => [...prev, res.url]);
          opts.onSuccess?.('');
        })
        .catch((e: Error) => opts.onError?.(e));
    },
    onChange: ({ fileList }: { fileList: UploadFile[] }) => setCoverList(fileList),
    onRemove: (f: UploadFile) => {
      const idx = coverList.findIndex((x) => x.uid === f.uid);
      if (idx >= 0) setCoverUrls((prev) => prev.filter((_, i) => i !== idx));
    },
  };

  const mismatch =
    coverUrls.length > 0 && parsedLinks.length > 0 && coverUrls.length !== parsedLinks.length;

  async function run() {
    if (coverUrls.length === 0) {
      message.warning('请先上传至少 1 张封面图');
      return;
    }
    if (parsedLinks.length === 0) {
      message.warning('请粘贴至少 1 条网盘分享链接');
      return;
    }
    if (mismatch) {
      message.warning(`封面 ${coverUrls.length} 张与链接 ${parsedLinks.length} 条数量不一致，将按下标配对，多余部分跳过`);
    }
    setRunning(true);
    setResults([]);
    setDone(0);
    setStep(1);
    const count = Math.min(coverUrls.length, parsedLinks.length);
    const acc: ImportResult[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const res = await api.post<{
          id: number;
          title: string;
          status: string;
          aiApplied: boolean;
          aiError?: string;
          submitError?: string;
        }>('/admin/templates/quick-import', {
          coverUrl: coverUrls[i],
          files: [parsedLinks[i]],
          format: defaultFormat,
          useAi,
          autoSubmit,
        });
        acc.push({ key: i, cover: coverUrls[i], ok: true, ...res });
      } catch (e) {
        acc.push({ key: i, cover: coverUrls[i], ok: false, error: e instanceof Error ? e.message : '导入失败' });
      }
      setResults([...acc]);
      setDone(i + 1);
    }
    setRunning(false);
    setStep(2);
  }

  const okCount = results.filter((r) => r.ok).length;
  const aiFailCount = results.filter((r) => r.aiError).length;

  const columns = [
    {
      title: '封面',
      dataIndex: 'cover',
      width: 72,
      render: (v: string) => <Image src={v} width={56} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} />,
    },
    {
      title: '结果',
      dataIndex: 'ok',
      width: 110,
      render: (ok: boolean, r: ImportResult) =>
        ok ? (
          <Tag color="success" icon={<CheckCircle2 size={12} />}>
            #{r.id}
          </Tag>
        ) : (
          <Tag color="error" icon={<AlertCircle size={12} />}>
            失败
          </Tag>
        ),
    },
    { title: '标题', dataIndex: 'title', ellipsis: true, render: (v?: string) => v ?? '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v?: string) => (v === 'pending_review' ? <Tag color="blue">待审核</Tag> : v ? <Tag>草稿</Tag> : '-'),
    },
    {
      title: '说明',
      ellipsis: true,
      render: (_: unknown, r: ImportResult) => {
        if (!r.ok) return <span style={{ color: '#cf1322' }}>{r.error}</span>;
        const tips: string[] = [];
        if (r.aiError) tips.push(`AI 未生效：${r.aiError}`);
        if (r.submitError) tips.push(`未自动提审：${r.submitError}`);
        if (!tips.length) return <span style={{ color: '#389e0d' }}>AI 已应用 · 链接已检查 · 已提审</span>;
        return <span style={{ color: '#d46b08' }}>{tips.join('；')}</span>;
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1080 }}>
      <Steps
        current={step}
        items={[{ title: '准备素材' }, { title: '自动导入中' }, { title: '完成' }]}
        style={{ marginBottom: 24 }}
      />

      {step === 0 && (
        <>
          <Card title="① 批量上传封面图（1 张 = 1 个模板）" style={{ marginBottom: 16 }}>
            <Upload.Dragger {...coverUpload}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽图片到此处（可多选）</p>
              <p className="ant-upload-hint">封面顺序即模板顺序，与下方链接逐一配对；图片会自动转 webp</p>
            </Upload.Dragger>
            {coverUrls.length > 0 && (
              <Alert
                type="success"
                showIcon
                style={{ marginTop: 12 }}
                message={`已上传 ${coverUrls.length} 张封面`}
              />
            )}
          </Card>

          <Card title="② 粘贴网盘分享链接（一行一个模板）" style={{ marginBottom: 16 }}>
            <Input.TextArea
              rows={8}
              placeholder={
                'https://pan.quark.cn/s/xxxxx 提取码：abc\n简历模板套装.zip https://pan.baidu.com/s/xxxx?pwd=ab12\n\n支持：\n· 夸克 / 百度链接自动识别\n· 行首可写文件名（可选）\n· 同行多个链接 = 一个模板多个文件'
              }
              value={linksText}
              onChange={(e) => setLinksText(e.target.value)}
            />
            <div style={{ marginTop: 8 }}>
              已解析 <b>{parsedLinks.length}</b> 条链接（夸克 {parsedLinks.filter((l) => l.netdiskType === 'quark').length} / 百度 {parsedLinks.filter((l) => l.netdiskType === 'baidu').length}）
              {mismatch && (
                <Typography.Text type="warning" style={{ marginLeft: 12 }}>
                  ⚠ 与封面数量不一致，将按顺序配对
                </Typography.Text>
              )}
            </div>
          </Card>

          <Card title="③ 导入选项" style={{ marginBottom: 16 }}>
            <Space size={40} wrap>
              <div>
                <div style={{ marginBottom: 4 }}>默认格式（文件名可推断时优先）</div>
                <Select
                  allowClear
                  placeholder="自动推断"
                  style={{ width: 160 }}
                  options={FORMAT_OPTIONS}
                  value={defaultFormat}
                  onChange={setDefaultFormat}
                />
              </div>
              <div>
                <div style={{ marginBottom: 4 }}>AI 自动补全并应用</div>
                <Switch checked={useAi} onChange={setUseAi} />
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  标题/摘要/分类/标签/定价直接写入
                </Typography.Text>
              </div>
              <div>
                <div style={{ marginBottom: 4 }}>信息完整时自动提审</div>
                <Switch checked={autoSubmit} onChange={setAutoSubmit} />
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  发布仍需人工审核通过
                </Typography.Text>
              </div>
            </Space>
          </Card>

          <Button type="primary" size="large" icon={<PlayCircle size={16} />} loading={running} onClick={run}>
            开始导入（{Math.min(coverUrls.length || 0, parsedLinks.length || 0)} 个模板）
          </Button>
        </>
      )}

      {step >= 1 && (
        <Card title={`导入进度（${done}/${Math.max(results.length, done)}）`}>
          <Progress
            percent={Math.round((done / Math.max(results.length || 1, done || 1)) * 100)}
            status={running ? 'active' : 'normal'}
            style={{ maxWidth: 480, marginBottom: 16 }}
          />
          <Table
            rowKey="key"
            size="small"
            columns={columns as never}
            dataSource={results}
            pagination={false}
            footer={() =>
              !running && results.length > 0 ? (
                <Space>
                  <span>成功 {okCount}</span>
                  <span>失败 {results.length - okCount}</span>
                  {aiFailCount > 0 && <Tag color="warning">{aiFailCount} 条 AI 未生效（已留草稿，可进编辑页人工补）</Tag>}
                </Space>
              ) : null
            }
          />
          {!running && step === 2 && (
            <Space style={{ marginTop: 16 }}>
              <Button
                onClick={() => {
                  setStep(0);
                  setResults([]);
                  setDone(0);
                  setCoverUrls([]);
                  setCoverList([]);
                  setLinksText('');
                }}
              >
                继续导入下一批
              </Button>
              <a href="/admin/templates?status=pending_review" target="_blank" rel="noreferrer">
                <Button type="primary">去资源管理批量审核</Button>
              </a>
            </Space>
          )}
        </Card>
      )}
    </div>
  );
}
