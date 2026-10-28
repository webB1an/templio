import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
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
import { Plus } from 'lucide-react';
import { api } from '../api';
import { CategoryItem, TagItem } from '../types';

const DIMENSION_OPTIONS = [
  { value: 'format', label: '格式' },
  { value: 'scene', label: '场景' },
  { value: 'audience', label: '人群' },
  { value: 'theme', label: '主题' },
];

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || `cat-${Date.now()}`
  );
}

function CategoriesTab() {
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dimension, setDimension] = useState<string | undefined>();
  const [modal, setModal] = useState<{ open: boolean; record?: CategoryItem }>({ open: false });
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CategoryItem[]>(`/admin/categories${dimension ? `?dimension=${dimension}` : ''}`);
      setItems(res);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [dimension]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled(r: CategoryItem, enabled: boolean) {
    try {
      await api.patch(`/admin/categories/${r.id}`, { enabled });
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  }

  async function remove(r: CategoryItem) {
    try {
      await api.delete(`/admin/categories/${r.id}`);
      message.success('已删除');
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  }

  async function submitModal() {
    const values = await form.validateFields();
    try {
      if (modal.record) {
        await api.patch(`/admin/categories/${modal.record.id}`, values);
      } else {
        await api.post('/admin/categories', values);
      }
      message.success('已保存');
      setModal({ open: false });
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: 'Slug', dataIndex: 'slug', width: 160 },
    {
      title: '维度',
      dataIndex: 'dimension',
      width: 90,
      render: (v: string) => DIMENSION_OPTIONS.find((o) => o.value === v)?.label ?? v,
    },
    {
      title: '父级',
      dataIndex: 'parent',
      width: 120,
      render: (v: { name: string } | null) => v?.name ?? '—（一级）',
    },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean, r: CategoryItem) => <Switch size="small" checked={v} onChange={(c) => toggleEnabled(r, c)} />,
    },
    {
      title: '操作',
      width: 130,
      render: (_: unknown, r: CategoryItem) => (
        <Space>
          <Button
            size="small"
            type="link"
            onClick={() => {
              setModal({ open: true, record: r });
              form.setFieldsValue({ name: r.name, slug: r.slug, parentId: r.parentId, sort: r.sort });
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除？有子级或关联模板时会被拒绝" onConfirm={() => remove(r)}>
            <Button size="small" type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      extra={
        <Space>
          <Select
            allowClear
            placeholder="全部维度"
            style={{ width: 120 }}
            options={DIMENSION_OPTIONS}
            onChange={(v) => setDimension(v)}
          />
          <Button
            type="primary"
            icon={<Plus size={14} />}
            onClick={() => {
              setModal({ open: true });
              form.resetFields();
              form.setFieldsValue({ sort: 0 });
            }}
          >
            新建分类
          </Button>
        </Space>
      }
    >
      <Table rowKey="id" size="middle" loading={loading} columns={columns as never} dataSource={items} pagination={false} />
      <Modal
        title={modal.record ? `编辑分类 #${modal.record.id}` : '新建分类'}
        open={modal.open}
        onOk={submitModal}
        onCancel={() => setModal({ open: false })}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="维度" name="dimension" rules={[{ required: true, message: '请选择维度' }]}>
            <Select options={DIMENSION_OPTIONS} disabled={!!modal.record} placeholder="选择维度" />
          </Form.Item>
          <Form.Item label="父分类（不选则为一级）" name="parentId">
            <Select
              allowClear
              placeholder="无"
              options={items
                .filter((c) => c.parentId === null && (!modal.record || c.id !== modal.record.id))
                .map((c) => ({ value: c.id, label: `${DIMENSION_OPTIONS.find((o) => o.value === c.dimension)?.label} / ${c.name}` }))}
            />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input
              onChange={(e) => {
                if (!modal.record && !form.getFieldValue('slug')) {
                  form.setFieldValue('slug', slugify(e.target.value));
                }
              }}
            />
          </Form.Item>
          <Form.Item label="Slug" name="slug" rules={[{ required: true, message: '请输入 slug' }]}>
            <Input placeholder="如 resume" />
          </Form.Item>
          <Form.Item label="排序" name="sort" initialValue={0}>
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

function TagsTab() {
  const [items, setItems] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.get<TagItem[]>('/admin/tags?pageSize=100'));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTag() {
    if (!newName.trim()) return;
    try {
      await api.post('/admin/tags', { name: newName.trim() });
      setNewName('');
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function renameTag(r: TagItem) {
    let name = r.name;
    Modal.confirm({
      title: '重命名标签',
      content: <Input defaultValue={r.name} onChange={(e) => (name = e.target.value)} />,
      onOk: async () => {
        if (!name.trim()) return Promise.reject();
        await api.patch(`/admin/tags/${r.id}`, { name: name.trim() });
        void load();
      },
    });
  }

  async function removeTag(r: TagItem) {
    try {
      await api.delete(`/admin/tags/${r.id}`);
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <Card>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="新标签名称"
          style={{ width: 240 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={createTag}
        />
        <Button type="primary" icon={<Plus size={14} />} onClick={createTag}>
          添加标签
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={items}
        pagination={false}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '名称', dataIndex: 'name', render: (v: string) => <Tag color="blue">{v}</Tag> },
          { title: '关联模板数', width: 120, render: (_: unknown, r: TagItem) => r._count?.templates ?? 0 },
          {
            title: '操作',
            width: 150,
            render: (_: unknown, r: TagItem) => (
              <Space>
                <Button size="small" type="link" onClick={() => renameTag(r)}>
                  重命名
                </Button>
                <Popconfirm title="确认删除该标签？" onConfirm={() => removeTag(r)}>
                  <Button size="small" type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}

export function Categories() {
  return (
    <Tabs
      defaultActiveKey="categories"
      items={[
        { key: 'categories', label: '分类（四维度两级）', children: <CategoriesTab /> },
        { key: 'tags', label: '标签', children: <TagsTab /> },
      ]}
    />
  );
}
