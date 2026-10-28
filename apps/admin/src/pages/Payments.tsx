import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { api } from '../api';
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PaymentOrderItem,
  PaymentSkuItem,
} from '../payTypes';

const PAGE_SIZE = 20;

function OrdersTab() {
  const [items, setItems] = useState<PaymentOrderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      const res = await api.get<{ items: PaymentOrderItem[]; total: number }>(`/admin/pay/orders?${params}`);
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

  async function closeOrder(id: number) {
    try {
      await api.patch(`/admin/pay/orders/${id}/close`);
      message.success('已关闭');
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  }

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', width: 200 },
    {
      title: '用户',
      dataIndex: 'user',
      width: 90,
      render: (_: unknown, r: PaymentOrderItem) => `#${r.userId}`,
    },
    {
      title: '商品',
      dataIndex: 'skuSnapshot',
      render: (v: Record<string, unknown>) => String(v?.name ?? '-'),
    },
    {
      title: '金额',
      dataIndex: 'amountFen',
      width: 90,
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    { title: '积分', dataIndex: 'creditsSnapshot', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <Tag color={ORDER_STATUS_COLORS[v]}>{ORDER_STATUS_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '下单时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '操作',
      width: 90,
      render: (_: unknown, r: PaymentOrderItem) =>
        r.status === 'created' ? (
          <Popconfirm title="确认关闭该订单？" onConfirm={() => closeOrder(r.id)}>
            <Button size="small" type="link" danger>
              关单
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        allowClear
        placeholder="全部状态"
        style={{ width: 140 }}
        options={Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
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
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => setPage(p),
        }}
      />
    </Space>
  );
}

function SkusTab() {
  const [items, setItems] = useState<PaymentSkuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; record?: PaymentSkuItem }>({ open: false });
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.get<PaymentSkuItem[]>('/admin/skus'));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const values = await form.validateFields();
    try {
      if (modal.record) {
        await api.patch(`/admin/skus/${modal.record.id}`, values);
      } else {
        await api.post('/admin/skus', values);
      }
      message.success('已保存');
      setModal({ open: false });
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  }

  const columns = [
    { title: 'Key', dataIndex: 'skuKey', width: 120 },
    { title: '名称', dataIndex: 'name', width: 140 },
    { title: '微信商品ID', dataIndex: 'wxProductId', width: 180 },
    { title: '价格', dataIndex: 'wxPriceFen', width: 90, render: (v: number) => `¥${(v / 100).toFixed(2)}` },
    { title: '积分', dataIndex: 'credits', width: 80 },
    { title: '赠送', dataIndex: 'bonusCredits', width: 80 },
    {
      title: '可用',
      dataIndex: 'enabled',
      width: 70,
      render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '开' : '关'}</Tag>,
    },
    {
      title: '已核验',
      dataIndex: 'verified',
      width: 90,
      render: (v: boolean) => <Tag color={v ? 'success' : 'warning'}>{v ? '已核验' : '未核验'}</Tag>,
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, r: PaymentSkuItem) => (
        <Button
          size="small"
          type="link"
          onClick={() => {
            setModal({ open: true, record: r });
            form.setFieldsValue(r);
          }}
        >
          编辑
        </Button>
      ),
    },
  ];

  return (
    <Card
      extra={
        <Button
          type="primary"
          onClick={() => {
            setModal({ open: true });
            form.resetFields();
          }}
        >
          新建充值项
        </Button>
      }
    >
      <Table rowKey="id" size="middle" loading={loading} columns={columns as never} dataSource={items} pagination={false} />
      <Modal
        title={modal.record ? `编辑充值项 #${modal.record.id}` : '新建充值项'}
        open={modal.open}
        onOk={submit}
        onCancel={() => setModal({ open: false })}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Key（唯一标识）" name="skuKey" rules={[{ required: true }]}>
            <Input disabled={!!modal.record} placeholder="如 credits_100" />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="如 100 积分" />
          </Form.Item>
          <Form.Item label="微信后台商品 ID" name="wxProductId" rules={[{ required: true }]} extra="微信后台「虚拟支付-商品管理」创建后填入">
            <Input />
          </Form.Item>
          <Space size="large">
            <Form.Item label="价格（分）" name="wxPriceFen" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="积分" name="credits" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="赠送积分" name="bonusCredits" initialValue={0}>
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Space size="large">
            <Form.Item label="角标文案" name="badgeText">
              <Input placeholder="如 最划算" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label="排序" name="sort" initialValue={0}>
              <InputNumber min={0} style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Space size="large">
            <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue={false}>
              <Switch />
            </Form.Item>
            <Form.Item
              label="已在微信后台核验"
              name="verified"
              valuePropName="checked"
              initialValue={false}
              extra="勾选 = 商品已在微信后台创建并发布、ID 与价格已核对"
            >
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}

function AdjustTab() {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  async function submit() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await api.post<{ balance: number }>('/admin/credits/adjust', values);
      message.success(`已调账，当前余额 ${res.balance}`);
      form.resetFields();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '调账失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="人工调账" style={{ maxWidth: 480 }}>
      <Form form={form} layout="vertical">
        <Form.Item label="用户 ID" name="userId" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="调整数额" name="amount" rules={[{ required: true }]} extra="正数加积分，负数扣积分">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="原因" name="reason">
          <Input placeholder="如：客诉补偿" />
        </Form.Item>
        <Button type="primary" loading={saving} onClick={submit} danger>
          执行调账
        </Button>
      </Form>
    </Card>
  );
}

export function Payments() {
  return (
    <Tabs
      defaultActiveKey="orders"
      items={[
        { key: 'orders', label: '充值订单', children: <OrdersTab /> },
        { key: 'skus', label: '充值项管理', children: <SkusTab /> },
        { key: 'adjust', label: '人工调账', children: <AdjustTab /> },
      ]}
    />
  );
}
