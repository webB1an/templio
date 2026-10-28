import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { Plus, RefreshCw, Link2, CheckCircle2, XCircle, ArrowDownToLine, Layers } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import {
  FORMAT_OPTIONS,
  STATUS_COLORS,
  STATUS_OPTIONS,
  TemplateItem,
  TemplateListResult,
  TemplateStatus,
  formatLabel,
  statusLabel,
} from '../types';

const PAGE_SIZE = 10;

export function Templates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<TemplateListResult>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [status, setStatus] = useState<TemplateStatus | undefined>(() => {
    const s = searchParams.get('status');
    return s && ['draft', 'pending_review', 'published', 'rejected', 'offline', 'banned'].includes(s)
      ? (s as TemplateStatus)
      : undefined;
  });
  const [format, setFormat] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (format) params.set('format', format);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await api.get<TemplateListResult>(`/admin/templates?${params.toString()}`);
      setData(res);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, status, format, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: number, action: string, body?: unknown, successText = '操作成功') {
    try {
      await api.post(`/admin/templates/${id}/${action}`, body);
      message.success(successText);
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  }

  async function checkFiles(id: number) {
    try {
      const res = await api.post<{ checked: number; results: { ok: boolean; message: string }[] }>(
        `/admin/templates/${id}/check-files`,
      );
      const okCount = res.results.filter((r) => r.ok).length;
      message.info(`链接检查完成：${okCount}/${res.checked} 可用`);
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '检查失败');
    }
  }

  async function remove(id: number) {
    try {
      await api.delete(`/admin/templates/${id}`);
      message.success('已删除');
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  }

  function rejectWithNote(id: number) {
    let note = '';
    Modal.confirm({
      title: '驳回原因',
      content: (
        <Input.TextArea
          placeholder="告知驳回原因（必填）"
          onChange={(e) => {
            note = e.target.value;
          }}
        />
      ),
      onOk: async () => {
        if (!note.trim()) {
          message.warning('请填写驳回原因');
          return Promise.reject();
        }
        await act(id, 'review', { action: 'reject', note: note.trim() }, '已驳回');
      },
    });
  }

  async function batchAction(kind: 'submit' | 'approve') {
    const ids = selectedKeys.map(Number);
    if (ids.length === 0) return;
    try {
      const res =
        kind === 'submit'
          ? await api.post<{ succeeded: number[]; failed: { id: number; message: string }[] }>(
              '/admin/templates/batch-submit',
              { ids },
            )
          : await api.post<{ succeeded: number[]; failed: { id: number; message: string }[] }>(
              '/admin/templates/batch-review',
              { ids, action: 'approve' },
            );
      if (res.failed.length) {
        message.warning(`成功 ${res.succeeded.length} 个，失败 ${res.failed.length} 个（状态不符）`);
      } else {
        message.success(`已批量处理 ${res.succeeded.length} 个模板`);
      }
      setSelectedKeys([]);
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '批量操作失败');
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string, r: TemplateItem) => (
        <a onClick={() => navigate(`/admin/templates/${r.id}`)}>
          {v} <Tag style={{ marginLeft: 4 }}>{formatLabel(r.format)}</Tag>
        </a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (v: TemplateStatus) => <Tag color={STATUS_COLORS[v]}>{statusLabel(v)}</Tag>,
    },
    {
      title: '积分价',
      dataIndex: 'baseCreditPrice',
      width: 80,
      render: (v: number) => (v === 0 ? '免费' : `${v} 分`),
    },
    {
      title: '分类',
      dataIndex: 'categories',
      ellipsis: true,
      render: (v: { category: { name: string } }[]) =>
        v.map((c) => (
          <Tag key={c.category.name} color="blue">
            {c.category.name}
          </Tag>
        )),
    },
    {
      title: '链接',
      dataIndex: 'files',
      width: 80,
      render: (v: { id: number; checkStatus: string | null }[] | undefined) => {
        const files = v ?? [];
        const ok = files.filter((f) => f.checkStatus === 'ok').length;
        const checked = files.filter((f) => f.checkStatus).length;
        return (
          <span style={{ fontSize: 12 }}>
            {ok}/{files.length}
            {checked > 0 ? ' 已检' : ''}
          </span>
        );
      },
    },
    {
      title: '操作',
      width: 300,
      render: (_: unknown, r: { id: number; status: TemplateStatus }) => (
        <Space size={4} wrap>
          <Button size="small" icon={<Link2 size={13} />} onClick={() => checkFiles(r.id)}>
            查链
          </Button>
          {['draft', 'rejected'].includes(r.status) && (
            <Button size="small" type="primary" onClick={() => act(r.id, 'submit', undefined, '已提审')}>
              提审
            </Button>
          )}
          {r.status === 'pending_review' && (
            <>
              <Popconfirm title="确认通过并发布？" onConfirm={() => act(r.id, 'review', { action: 'approve' }, '已发布')}>
                <Button size="small" icon={<CheckCircle2 size={13} />} danger={false}>
                  通过
                </Button>
              </Popconfirm>
              <Button size="small" danger icon={<XCircle size={13} />} onClick={() => rejectWithNote(r.id)}>
                驳回
              </Button>
            </>
          )}
          {r.status === 'published' && (
            <Button
              size="small"
              icon={<ArrowDownToLine size={13} />}
              onClick={() => act(r.id, 'offline', {}, '已下架')}
            >
              下架
            </Button>
          )}
          <Button size="small" type="text" onClick={() => navigate(`/admin/templates/${r.id}`)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该模板？"
            description="仅草稿/驳回状态可删除"
            onConfirm={() => remove(r.id)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 130 }}
          options={STATUS_OPTIONS}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="格式"
          style={{ width: 110 }}
          options={FORMAT_OPTIONS}
          value={format}
          onChange={(v) => {
            setFormat(v);
            setPage(1);
          }}
        />
        <Input.Search
          placeholder="搜索标题关键词"
          style={{ width: 240 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Button icon={<RefreshCw size={14} />} onClick={() => void load()} />
        <Button
          type="primary"
          icon={<Plus size={14} />}
          onClick={() => navigate('/admin/templates/new')}
        >
          新建模板
        </Button>
        <Button
          icon={<Layers size={14} />}
          onClick={() => navigate('/admin/templates/batch')}
        >
          批量导入
        </Button>
        {selectedKeys.length > 0 && (
          <Space>
            <span style={{ fontSize: 13 }}>已选 {selectedKeys.length} 项</span>
            <Button size="small" onClick={() => void batchAction('submit')}>
              批量提审
            </Button>
            <Popconfirm title={`确认批量通过并发布选中的 ${selectedKeys.length} 个模板？`} onConfirm={() => void batchAction('approve')}>
              <Button size="small" type="primary">
                批量通过
              </Button>
            </Popconfirm>
          </Space>
        )}
      </Space>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns as never}
        dataSource={data.items}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys),
        }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => setPage(p),
        }}
      />
    </div>
  );
}
