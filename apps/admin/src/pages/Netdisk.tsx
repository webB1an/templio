import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { CheckCircle2, XCircle, Plus } from 'lucide-react';
import { api } from '../api';

interface StorageAccountItem {
  id: string;
  provider: 'quark' | 'baidu';
  label: string;
  accountName: string | null;
  isDefault: boolean;
  isActive: boolean;
  lastProbeOk: boolean | null;
  lastProbeMessage: string | null;
  lastProbeAt: string | null;
  createdAt: string;
}

const PROVIDER_LABEL: Record<string, string> = { quark: '夸克网盘', baidu: '百度网盘' };

/**
 * 网盘管理：只管理网盘账号本身（新增 / 授权 / 探测 / 设默认 / 删除）。
 * 文件的上传与分享不在本页操作 —— 由「资源管理 → 批量导入」与「编辑模板 → 上传原文件」
 * 自动完成：原文件上传到默认网盘、生成永久分享链接并回填到模板。
 */
export function Netdisk() {
  const [accounts, setAccounts] = useState<StorageAccountItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await api.get<StorageAccountItem[]>('/admin/storage-accounts'));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '账号加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(p: () => Promise<unknown>, successText?: string) {
    try {
      await p();
      if (successText) message.success(successText);
      void load();
      return true;
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
      return false;
    }
  }

  function addAccount() {
    let provider: 'quark' | 'baidu' = 'quark';
    let label = '';
    Modal.confirm({
      title: '新增网盘账号',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select<'quark' | 'baidu'>
            style={{ width: '100%' }}
            defaultValue="quark"
            options={[
              { value: 'quark', label: '夸克网盘' },
              { value: 'baidu', label: '百度网盘' },
            ]}
            onChange={(v) => {
              provider = v;
            }}
          />
          <Input placeholder="账号名称（如：夸克主号）" onChange={(e) => (label = e.target.value)} />
        </Space>
      ),
      onOk: async () => {
        if (!label.trim()) {
          message.warning('请填写账号名称');
          return Promise.reject();
        }
        await act(() => api.post('/admin/storage-accounts', { provider, label: label.trim() }), '已创建，请完成授权');
      },
    });
  }

  function authQuark(id: string) {
    let code = '';
    void act(async () => {
      const res = await api.post<{ authUrl?: string; message?: string }>(`/admin/storage-accounts/${id}/quark-auth/start`);
      if (!res.authUrl) {
        message.success(res.message || '已完成授权');
        return;
      }
      window.open(res.authUrl, '_blank');
      message.info('已打开授权页面，完成后把授权码粘贴到弹窗');
      return new Promise<boolean>((resolveP) => {
        Modal.confirm({
          title: '粘贴夸克授权码',
          content: <Input.TextArea placeholder="把授权页面显示的授权码粘贴到这里" onChange={(e) => (code = e.target.value)} />,
          onOk: async () => {
            if (!code.trim()) {
              message.warning('请填写授权码');
              return Promise.reject();
            }
            await act(() => api.post(`/admin/storage-accounts/${id}/quark-auth/finish`, { code: code.trim() }), '夸克授权完成');
            resolveP(true);
          },
          onCancel: () => resolveP(true),
        });
      });
    });
  }

  function authBaidu(id: string) {
    let cookie = '';
    Modal.confirm({
      title: '粘贴百度网盘 Cookie',
      width: 560,
      content: (
        <div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            浏览器登录 pan.baidu.com → F12 → Network → 任一请求 → 复制请求头里的整段 Cookie（需含 BAIDUID）。
            凭证只保存在服务器该账号的独立文件中，不进数据库与代码仓库。
          </Typography.Paragraph>
          <Input.TextArea
            rows={4}
            placeholder="BAIDUID=...; STOKEN=...; ..."
            onChange={(e) => (cookie = e.target.value)}
          />
        </div>
      ),
      onOk: async () => {
        if (!cookie.trim()) {
          message.warning('请粘贴 Cookie');
          return Promise.reject();
        }
        await act(() => api.post(`/admin/storage-accounts/${id}/baidu-cookie`, { cookie: cookie.trim() }), '百度授权完成');
      },
    });
  }

  function auth(account: StorageAccountItem) {
    if (account.provider === 'quark') authQuark(account.id);
    else authBaidu(account.id);
  }

  const columns = [
    { title: '类型', dataIndex: 'provider', width: 100, render: (v: string) => <Tag color={v === 'quark' ? 'blue' : 'geekblue'}>{PROVIDER_LABEL[v]}</Tag> },
    { title: '名称', dataIndex: 'label' },
    { title: '账号', dataIndex: 'accountName', render: (v: string | null) => v ?? <Typography.Text type="secondary">未探测</Typography.Text> },
    {
      title: '默认',
      dataIndex: 'isDefault',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="gold">默认</Tag> : ''),
    },
    {
      title: '授权状态',
      dataIndex: 'lastProbeOk',
      width: 200,
      render: (v: boolean | null, r: StorageAccountItem) =>
        v === null || v === undefined ? (
          <Tag>未探测</Tag>
        ) : v ? (
          <Tag color="success" icon={<CheckCircle2 size={12} />}>正常</Tag>
        ) : (
          <Tag color="error" icon={<XCircle size={12} />}>异常</Tag>
        ),
      ellipsis: true,
    },
    { title: '最近探测', dataIndex: 'lastProbeMessage', ellipsis: true, render: (v: string | null) => v ?? '-' },
    {
      title: '操作',
      width: 300,
      render: (_: unknown, r: StorageAccountItem) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => auth(r)}>
            {r.provider === 'quark' ? '授权' : '配置 Cookie'}
          </Button>
          <Button size="small" onClick={() => void act(() => api.post(`/admin/storage-accounts/${r.id}/probe`), '探测完成')}>
            探测
          </Button>
          {!r.isDefault && (
            <Button size="small" onClick={() => void act(() => api.post(`/admin/storage-accounts/${r.id}/default`), '已设为默认')}>
              设默认
            </Button>
          )}
          <Popconfirm title="确认删除该账号？授权态文件会一并清除。" onConfirm={() => void act(() => api.delete(`/admin/storage-accounts/${r.id}`), '已删除')}>
            <Button size="small" danger type="text">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card
        title="网盘账号"
        extra={
          <Button type="primary" icon={<Plus size={14} />} onClick={addAccount}>
            新增账号
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="网盘账号只负责授权与可用性；模板文件的上传与分享由「资源管理 → 批量导入」自动完成。每个账号授权态独立隔离，凭证只保存在服务器。"
        />
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns as never}
          dataSource={accounts}
          pagination={false}
        />
      </Card>

    </Space>
  );
}
