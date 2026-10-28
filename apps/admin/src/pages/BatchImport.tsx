import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  InputNumber,
  Progress,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import { PlayCircle, CheckCircle2, XCircle, RotateCcw, Images } from 'lucide-react';
import { InboxOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const MAX_FILES = 50;

interface ImportTaskView {
  id: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'retry_waiting';
  stage: string | null;
  progress: number;
  message: string | null;
  error: string | null;
  templateId: number | null;
  fileName: string;
  size: number | null;
  cover: string | null;
  previews: string[];
  pages: number;
  shareUrl: string | null;
  provider: string | null;
  aiApplied: boolean;
  submitted: boolean;
}

interface BatchDetail {
  id: number;
  status: string;
  createdAt: string;
  tasks: ImportTaskView[];
}

const STAGE_LABEL: Record<string, string> = {
  queued: '排队中',
  render: '生成预览图',
  create: '创建草稿',
  upload: '上传网盘分享',
  ai: 'AI 补全',
  submit: '提交审核',
  done: '完成',
};

/**
 * 批量导入（资源管理 → 批量导入）
 *
 * 拖入模板原文件即可，后端按顺序自动完成：
 * ① 渲染首图 + 多页预览图 ② 建模板草稿 ③ 上传默认网盘并生成永久分享链接
 * ④ AI 识别标题/分类/标签/定价 ⑤ 自动提审
 * 页面轮询展示每条任务的阶段进度，失败可断点重试。
 */
export function BatchImport() {
  const navigate = useNavigate();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [provider, setProvider] = useState<'auto' | 'quark' | 'baidu'>('auto');
  const [useAi, setUseAi] = useState(true);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [maxPages, setMaxPages] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const running = !!batch?.tasks.some(
    (t) => t.status === 'queued' || t.status === 'running' || t.status === 'retry_waiting',
  );

  const poll = useCallback(async (id: number) => {
    try {
      const detail = await api.get<BatchDetail>(`/admin/imports/${id}`);
      setBatch(detail);
      const busy = detail.tasks.some(
        (t) => t.status === 'queued' || t.status === 'running' || t.status === 'retry_waiting',
      );
      if (busy) timer.current = setTimeout(() => void poll(id), 2500);
    } catch {
      timer.current = setTimeout(() => void poll(id), 5000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function start() {
    if (!fileList.length) {
      message.warning('请先拖入或选择模板原文件');
      return;
    }
    const fd = new FormData();
    for (const item of fileList) {
      if (item.originFileObj) fd.append('files', item.originFileObj as File);
    }
    if (provider !== 'auto') fd.append('provider', provider);
    fd.append('useAi', String(useAi));
    fd.append('autoSubmit', String(autoSubmit));
    fd.append('maxPages', String(maxPages));

    setSubmitting(true);
    try {
      const res = await api.upload<{ batchId: number; total: number }>('/admin/imports', fd);
      message.success(`已提交 ${res.total} 个文件，正在后台自动处理`);
      setBatchId(res.batchId);
      setFileList([]);
      if (timer.current) clearTimeout(timer.current);
      void poll(res.batchId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function retry(taskId: number) {
    try {
      await api.post(`/admin/imports/tasks/${taskId}/retry`);
      message.success('已重新排队');
      if (batchId) void poll(batchId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '重试失败');
    }
  }

  const tasks = batch?.tasks ?? [];
  const succeeded = tasks.filter((t) => t.status === 'succeeded').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const finished = tasks.length > 0 && !running;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card title="批量导入模板">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="拖入模板原文件（PPT / Word / Excel / PDF），后端全自动完成后续流程"
          description={
            <Typography.Text type="secondary">
              自动生成首图与预览图 → 上传默认网盘并生成永久分享链接 → AI 识别标题/分类/标签/定价 →
              信息完整即自动提审。发布终审仍由人工在资源管理中一键完成。
              <br />
              <Typography.Text type="warning">
                提示：PPTX/DOCX 会提取文档内置缩略图作为首图；如需多页预览图，请先将文件导出为 PDF
                再导入（PDF 会逐页渲染）。
              </Typography.Text>
            </Typography.Text>
          }
        />

        <Upload.Dragger
          multiple
          accept=".ppt,.pptx,.pps,.ppsx,.doc,.docx,.pdf,.xls,.xlsx,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp"
          fileList={fileList}
          beforeUpload={() => false}
          onChange={({ fileList: list }) => setFileList(list.slice(0, MAX_FILES))}
          disabled={submitting || running}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 40, color: '#245BFF' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽模板原文件到此处</p>
          <p className="ant-upload-hint">
            一个文件 = 一个模板，单文件最大 300MB，一次最多 {MAX_FILES} 个
          </p>
        </Upload.Dragger>

        <Space wrap size={16} style={{ marginTop: 16 }}>
          <Space size={6}>
            <Typography.Text type="secondary">目标网盘</Typography.Text>
            <Select
              value={provider}
              onChange={setProvider}
              style={{ width: 148 }}
              options={[
                { value: 'auto', label: '自动（默认账号）' },
                { value: 'quark', label: '夸克网盘' },
                { value: 'baidu', label: '百度网盘' },
              ]}
            />
          </Space>
          <Space size={6}>
            <Typography.Text type="secondary">预览页数</Typography.Text>
            <InputNumber
              min={1}
              max={20}
              value={maxPages}
              onChange={(v) => setMaxPages(v ?? 6)}
              style={{ width: 78 }}
            />
          </Space>
          <Checkbox checked={useAi} onChange={(e) => setUseAi(e.target.checked)}>
            自动补全（标题/分类/标签/定价）
          </Checkbox>
          <Checkbox checked={autoSubmit} onChange={(e) => setAutoSubmit(e.target.checked)}>
            完成后自动提审
          </Checkbox>
          <Button
            type="primary"
            icon={<PlayCircle size={15} />}
            loading={submitting}
            disabled={running || !fileList.length}
            onClick={() => void start()}
          >
            开始导入（{fileList.length}）
          </Button>
        </Space>
      </Card>

      {!batch ? (
        <Card>
          <Empty description="还没有导入任务。拖入文件后点击「开始导入」。" />
        </Card>
      ) : (
        <Card
          title={`导入进度 · 批次 #${batch.id}`}
          extra={
            <Space>
              <Tag color="success">成功 {succeeded}</Tag>
              {failed > 0 && <Tag color="error">失败 {failed}</Tag>}
              {running && <Tag color="processing">处理中…</Tag>}
              <Button size="small" onClick={() => navigate('/admin/templates?status=pending_review')}>
                去资源管理
              </Button>
            </Space>
          }
        >
          {finished && (
            <Alert
              type={failed ? 'warning' : 'success'}
              showIcon
              style={{ marginBottom: 12 }}
              message={
                failed
                  ? `本批次完成：成功 ${succeeded} 个，失败 ${failed} 个。失败项可点「重试」从断点继续（已完成阶段不会重复执行）。`
                  : `本批次全部完成：${succeeded} 个模板已生成${autoSubmit ? '并提交审核' : ''}。`
              }
            />
          )}
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} onRetry={() => void retry(task.id)} />
            ))}
          </Space>
        </Card>
      )}
    </Space>
  );
}

function TaskRow({ task, onRetry }: { task: ImportTaskView; onRetry: () => void }) {
  const ok = task.status === 'succeeded';
  const bad = task.status === 'failed';
  return (
    <Card size="small" styles={{ body: { padding: 12 } }}>
      <Space align="start" style={{ width: '100%' }} size={12}>
        <div style={{ width: 76, flex: '0 0 auto' }}>
          {task.cover ? (
            <div style={{ position: 'relative' }}>
              <img
                src={task.cover}
                alt=""
                style={{
                  width: 76,
                  height: 57,
                  objectFit: 'cover',
                  borderRadius: 6,
                  border: '1px solid #eef1f8',
                }}
              />
              {task.pages > 1 && (
                <Tooltip title={`已生成 ${task.pages} 页预览图`}>
                  <Tag
                    color="blue"
                    style={{
                      position: 'absolute',
                      right: -6,
                      bottom: -8,
                      fontSize: 10,
                      lineHeight: '16px',
                      padding: '0 4px',
                    }}
                  >
                    <Images size={10} /> {task.pages}
                  </Tag>
                </Tooltip>
              )}
            </div>
          ) : (
            <div
              style={{
                width: 76,
                height: 57,
                borderRadius: 6,
                background: '#f5f7fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9aa7c2',
                fontSize: 11,
              }}
            >
              无预览
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={8} wrap>
            <Typography.Text strong ellipsis style={{ maxWidth: 380 }}>
              {task.fileName}
            </Typography.Text>
            {ok && (
              <Tag color="success" icon={<CheckCircle2 size={12} />}>
                完成
              </Tag>
            )}
            {bad && (
              <Tag color="error" icon={<XCircle size={12} />}>
                失败
              </Tag>
            )}
            {(task.status === 'running' || task.status === 'queued') && (
              <Tag color="processing">{STAGE_LABEL[task.stage ?? 'queued'] ?? task.stage}</Tag>
            )}
            {task.aiApplied && <Tag color="purple">AI 已补全</Tag>}
            {task.submitted && <Tag color="gold">已提审</Tag>}
            {task.templateId && (
              <Typography.Link href={`/admin/templates/${task.templateId}`} target="_blank">
                查看模板 #{task.templateId}
              </Typography.Link>
            )}
          </Space>
          <Progress
            percent={task.progress}
            size="small"
            status={bad ? 'exception' : ok ? 'success' : 'active'}
            style={{ marginBottom: 0, marginTop: 6 }}
          />
          <Typography.Text type={bad ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
            {bad ? task.error : task.message}
          </Typography.Text>
        </div>

        {bad && (
          <Button size="small" icon={<RotateCcw size={13} />} onClick={onRetry}>
            重试
          </Button>
        )}
      </Space>
    </Card>
  );
}
