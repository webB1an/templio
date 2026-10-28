import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { api } from '../api';

interface ComplaintItem {
  id: number;
  templateId: number;
  template?: { id: number; title: string };
  type: string;
  reporterName: string | null;
  contact: string | null;
  content: string;
  evidence: unknown;
  status: 'pending' | 'resolved' | 'rejected';
  resolution: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  copyright: '侵权/版权',
  violation: '违规内容',
  other: '其他',
};

const STATUS_META: Record<string, { color: string; label: string }> = {
  pending: { color: 'processing', label: '待处理' },
  resolved: { color: 'success', label: '已受理' },
  rejected: { color: 'default', label: '已驳回' },
};

/** 用户投诉处理（PRD §10 合规） */
export function Complaints() {
  const [items, setItems] = useState<ComplaintItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; record?: ComplaintItem }>({ open: false });
  const [resolution, setResolution] = useState('');
  const [nextStatus, setNextStatus] = useState<'resolved' | 'rejected'>('resolved');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      const res = await api.get<{ items: ComplaintItem[]; total: number }>(`/admin/complaints?${params}`);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!modal.record) return;
    setSaving(true);
    try {
      await api.patch(`/admin/complaints/${modal.record.id}`, { status: nextStatus, resolution });
      message.success('已处理');
      setModal({ open: false });
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '模板',
      dataIndex: 'template',
      width: 180,
      render: (_: unknown, r: ComplaintItem) => (r.template ? `#${r.template.id} ${r.template.title}` : `#${r.templateId}`),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (v: string) => TYPE_LABELS[v] ?? v,
    },
    { title: '联系人', dataIndex: 'reporterName', width: 100, render: (v: string | null) => v ?? '-' },
    { title: '联系方式', dataIndex: 'contact', width: 130, render: (v: string | null) => v ?? '-' },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (v: string) => <span title={v}>{v}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label ?? v}</Tag>,
    },
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => new Date(v).toLocaleString() },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, r: ComplaintItem) =>
        r.status === 'pending' ? (
          <Button
            size="small"
            type="link"
            onClick={() => {
              setModal({ open: true, record: r });
              setResolution('');
              setNextStatus('resolved');
            }}
          >
            处理
          </Button>
        ) : (
          <span style={{ fontSize: 12, color: '#999' }}>{r.resolution ?? '-'}</span>
        ),
    },
  ];

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Select
          allowClear
          placeholder="全部状态"
          style={{ width: 140 }}
          options={Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns as never}
          dataSource={items}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
          }}
        />
      </Space>
      <Modal
        title={modal.record ? `处理投诉 #${modal.record.id}` : ''}
        open={modal.open}
        onCancel={() => setModal({ open: false })}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
          <Select
            style={{ width: 200 }}
            value={nextStatus}
            onChange={setNextStatus}
            options={[
              { value: 'resolved', label: '已受理' },
              { value: 'rejected', label: '已驳回' },
            ]}
          />
          <Input.TextArea
            rows={3}
            placeholder="处理说明（可空）"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
        </Space>
      </Modal>
    </Card>
  );
}
