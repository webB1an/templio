import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { api } from '../api';

type CheckStatus = 'ok' | 'invalid' | 'need_passcode' | 'unknown';

interface ShareFile {
  name: string;
  size: number;
}

interface CheckResult {
  status: CheckStatus;
  message: string;
  files?: ShareFile[];
}

const STATUS_META: Record<CheckStatus, { color: string; label: string }> = {
  ok: { color: 'success', label: '链接有效' },
  invalid: { color: 'error', label: '链接失效' },
  need_passcode: { color: 'warning', label: '需要提取码' },
  unknown: { color: 'default', label: '无法确认' },
};

function fmtSize(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

/**
 * 网盘管理：
 * - 分享链接按模板文件在「资源管理 → 编辑模板」中维护；
 * - 本页提供网盘接入状态说明 + 分享链接健康检查工具。
 */
export function Netdisk() {
  const [form] = Form.useForm();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function check() {
    const values = await form.validateFields();
    setChecking(true);
    setResult(null);
    try {
      const res = await api.post<CheckResult>('/admin/netdisk/check-link', values);
      setResult(res);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '检查失败');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card title="网盘接入状态">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="夸克网盘">
            <Tag color="success">已接入</Tag>
            <Typography.Text type="secondary">登录态方式（服务器侧凭证），支持分享链接健康检查</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="百度网盘">
            <Tag color="success">已接入</Tag>
            <Typography.Text type="secondary">登录态方式（服务器侧凭证），支持分享链接健康检查</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="凭证管理">
            <Typography.Text type="secondary">
              网盘账号凭证保存在服务器环境变量中，不进管理端与代码仓库（安全约定）
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="分享链接维护">
            <Typography.Text>
              每个模板的网盘分享链接在 <b>资源管理 → 编辑模板 → 文件</b> 中按文件录入（网盘类型 + 链接）。
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="分享链接健康检查">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="粘贴夸克/百度分享链接（含提取码格式如 链接?pwd=xxxx）检查是否有效、是否需要提取码以及文件清单。"
        />
        <Form
          form={form}
          layout="inline"
          initialValues={{ netdiskType: 'quark' }}
          style={{ rowGap: 8, flexWrap: 'wrap' }}
        >
          <Form.Item name="netdiskType" rules={[{ required: true }]}>
            <Select style={{ width: 120 }} options={[{ value: 'quark', label: '夸克网盘' }, { value: 'baidu', label: '百度网盘' }]} />
          </Form.Item>
          <Form.Item name="url" rules={[{ required: true, message: '请输入分享链接' }]} style={{ minWidth: 360 }}>
            <Input placeholder="https://pan.quark.cn/s/xxxxxxxx" allowClear />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={checking} onClick={() => void check()}>
              检查
            </Button>
          </Form.Item>
        </Form>

        {result && (
          <div style={{ marginTop: 16 }}>
            <Space size={8} style={{ marginBottom: 8 }}>
              <Tag color={STATUS_META[result.status].color}>{STATUS_META[result.status].label}</Tag>
              <Typography.Text type="secondary">{result.message}</Typography.Text>
            </Space>
            {!!result.files?.length && (
              <Table
                rowKey="name"
                size="small"
                pagination={false}
                dataSource={result.files}
                columns={[
                  { title: '文件名', dataIndex: 'name' },
                  { title: '大小', dataIndex: 'size', width: 120, render: (v: number) => fmtSize(v) },
                ]}
              />
            )}
          </div>
        )}
      </Card>
    </Space>
  );
}
