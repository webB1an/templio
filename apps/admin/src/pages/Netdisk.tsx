import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { CheckCircle2, XCircle, Plus, Upload as UploadIcon } from 'lucide-react';
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

interface UploadShareResult {
  provider: string;
  url: string;
  passcode?: string | null;
  remotePath?: string | null;
}

const PROVIDER_LABEL: Record<string, string> = { quark: '夸克网盘', baidu: '百度网盘' };

/**
 * 网盘管理：
 * - 多账号管理（参照 wallpaper-manager）：新增 / 授权 / 探测 / 设默认 / 删除；
 * - 上传分享工具：本地文件 → 自动上传网盘 → 生成永久公开分享链接；
 * - 分享链接健康检查保留。
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

  // ---- 上传分享工具 ----
  const [upProvider, setUpProvider] = useState<'quark' | 'baidu'>('quark');
  const [upAccountId, setUpAccountId] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [shareResult, setShareResult] = useState<UploadShareResult | null>(null);

  const providerAccounts = accounts.filter((a) => a.provider === upProvider);
  const defaultAccount = providerAccounts.find((a) => a.isDefault);

  const uploadProps = {
    showUploadList: false,
    customRequest: (opts: { file: unknown; onSuccess?: (b: string) => void; onError?: (e: Error) => void }) => {
      const fd = new FormData();
      fd.append('file', opts.file as File);
      fd.append('provider', upProvider);
      if (upAccountId) fd.append('accountId', upAccountId);
      setUploading(true);
      setShareResult(null);
      api
        .upload<UploadShareResult>('/admin/storage-accounts/upload-share', fd)
        .then((res) => {
          setShareResult(res);
          message.success('上传并分享成功');
          opts.onSuccess?.('');
        })
        .catch((e: Error) => message.error(e instanceof Error ? e.message : '上传失败'))
        .finally(() => setUploading(false));
    },
  };

  const fullUrl = shareResult ? `${shareResult.url}${shareResult.passcode ? `?pwd=${shareResult.passcode}` : ''}` : '';

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
          message="上传模板文件后自动上传到默认网盘并生成永久分享链接；每个账号授权态独立隔离，凭证只保存在服务器。"
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

      <Card title="上传分享工具">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            <Radio.Group
              value={upProvider}
              onChange={(e) => {
                setUpProvider(e.target.value);
                setUpAccountId(undefined);
                setShareResult(null);
              }}
              options={[
                { value: 'quark', label: '夸克网盘' },
                { value: 'baidu', label: '百度网盘' },
              ]}
              optionType="button"
            />
            <Select
              allowClear
              placeholder={defaultAccount ? `默认：${defaultAccount.label}` : '未配置默认账号'}
              style={{ width: 200 }}
              value={upAccountId}
              onChange={setUpAccountId}
              options={providerAccounts.map((a) => ({ value: a.id, label: a.isDefault ? `${a.label}（默认）` : a.label }))}
            />
            <Upload {...uploadProps}>
              <Button type="primary" icon={<UploadIcon size={14} />} loading={uploading}>
                选择文件上传并生成分享链接
              </Button>
            </Upload>
          </Space>
          {providerAccounts.length === 0 && (
            <Typography.Text type="warning">该类型还没有账号，请先在上方新增并完成授权。</Typography.Text>
          )}
          {shareResult && (
            <Alert
              type="success"
              showIcon
              message={
                <Space wrap>
                  <a href={fullUrl} target="_blank" rel="noreferrer">
                    {fullUrl}
                  </a>
                  <Button
                    size="small"
                    onClick={() => {
                      void navigator.clipboard.writeText(fullUrl);
                      message.success('已复制');
                    }}
                  >
                    复制
                  </Button>
                  {shareResult.passcode && <Tag color="gold">提取码 {shareResult.passcode}</Tag>}
                </Space>
              }
            />
          )}
        </Space>
      </Card>
    </Space>
  );
}
