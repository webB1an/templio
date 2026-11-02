import { useCallback, useEffect, useState } from "react";
import type { Key } from "react";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import type { TableProps } from "antd";
import { api } from "../api";
import type { AdminTemplate, Facets, TemplateStatus } from "../types";
import { STATUS_META, STATUS_OPTIONS, formatSize, formatTime } from "../utils";

const PAGE_SIZE = 10;

interface EditValues {
  title: string;
  description?: string;
  categoryId?: string;
  status: TemplateStatus;
}

export default function Templates() {
  const [items, setItems] = useState<AdminTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState("");
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Key[]>([]);
  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<EditValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.templates({
        status,
        category,
        q: keyword || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, category, keyword, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .facets()
      .then(setFacets)
      .catch(() => undefined);
  }, []);

  const changeStatus = async (record: AdminTemplate, next: TemplateStatus) => {
    try {
      await api.updateTemplate(record.id, { status: next });
      message.success(next === "published" ? "已上架" : "已下架");
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const bulkAction = async (action: "publish" | "offline") => {
    if (selected.length === 0) {
      message.warning("请先选择模板");
      return;
    }
    try {
      const result = await api.bulk(selected.map(String), action);
      message.success(`已处理 ${result.updated} 个模板`);
      setSelected([]);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const openEdit = (record: AdminTemplate) => {
    setEditing(record);
    form.setFieldsValue({
      title: record.title,
      description: record.description,
      categoryId: record.category?.id,
      status: record.status
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.updateTemplate(editing.id, {
        title: values.title,
        description: values.description,
        categoryId: values.categoryId,
        status: values.status
      });
      message.success("已保存");
      setEditing(null);
      await load();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: NonNullable<TableProps<AdminTemplate>["columns"]> = [
    {
      title: "模板标题",
      dataIndex: "title",
      ellipsis: true,
      render: (title: string, record) => (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {record.coverUrl ? (
            <img
              src={record.coverUrl}
              alt=""
              style={{ width: 40, height: 53, objectFit: "cover", borderRadius: 6, flex: "none" }}
            />
          ) : null}
          <div>
            <div style={{ fontWeight: 600 }}>{title}</div>
            <div style={{ color: "#8a90a6", fontSize: 12 }}>
              {record.format} · {record.pageCount} 页 · {formatSize(record.fileSize)}
            </div>
          </div>
        </div>
      )
    },
    {
      title: "分类",
      dataIndex: "category",
      width: 120,
      render: (value: AdminTemplate["category"]) => value?.name || "-"
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => {
        const meta = STATUS_META[value] || { label: value, color: "default" };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      }
    },
    {
      title: "交付",
      dataIndex: "shortCode",
      width: 170,
      render: (code: string | null, record) =>
        code ? (
          <div>
            <Tag color="blue">短链</Tag>
            <span style={{ color: "#8a90a6", fontSize: 12 }}>{code}</span>
            {record.passcode ? (
              <div style={{ color: "#8a90a6", fontSize: 12 }}>提取码 {record.passcode}</div>
            ) : null}
          </div>
        ) : (
          <Tag>未配置</Tag>
        )
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 180,
      render: (value: string) => formatTime(value)
    },
    {
      title: "操作",
      key: "actions",
      width: 170,
      render: (_value, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          {record.status === "published" ? (
            <Button type="link" size="small" danger onClick={() => changeStatus(record, "archived")}>
              下架
            </Button>
          ) : (
            <Button type="link" size="small" onClick={() => changeStatus(record, "published")}>
              上架
            </Button>
          )}
        </Space>
      )
    }
  ];

  const categoryOptions = (facets?.categories || []).map((item) => ({
    value: item.key,
    label: item.name
  }));

  return (
    <div>
      <div className="toolbar">
        <Input.Search
          allowClear
          placeholder="搜索标题 / 简介"
          style={{ width: 260 }}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 140 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="分类"
          style={{ width: 160 }}
          value={category}
          options={categoryOptions}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
        />
        <Button onClick={() => void load()}>刷新</Button>
        <div style={{ flex: 1 }} />
        <Button disabled={selected.length === 0} onClick={() => void bulkAction("publish")}>
          批量上架
        </Button>
        <Button disabled={selected.length === 0} onClick={() => void bulkAction("offline")}>
          批量下架
        </Button>
      </div>

      <Table<AdminTemplate>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          showTotal: (count) => `共 ${count} 个模板`,
          onChange: (nextPage) => setPage(nextPage)
        }}
        scroll={{ x: 980 }}
      />

      <Modal
        open={Boolean(editing)}
        title="编辑模板"
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void saveEdit()}
        onCancel={() => setEditing(null)}
      >
        <Form<EditValues> form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="description" label="简介">
            <Input.TextArea rows={4} maxLength={5000} showCount />
          </Form.Item>
          <Form.Item name="categoryId" label="分类">
            <Select allowClear options={categoryOptions} placeholder="选择分类" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
