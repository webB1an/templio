import { useCallback, useEffect, useState } from "react";
import type { Key } from "react";
import { Button, Form, Input, Modal, Select, Space, Spin, Table, Tag, Typography, message } from "antd";
import type { TableProps } from "antd";
import { api } from "../api";
import type { AdminTemplate, AiAnalysis, Facets, TemplateStatus } from "../types";
import { STATUS_META, STATUS_OPTIONS, formatSize, formatTime } from "../utils";

const PAGE_SIZE = 10;

const PROVIDER_LABELS: Record<string, string> = {
  baidu: "百度网盘",
  quark: "夸克网盘"
};

interface EditValues {
  title: string;
  description?: string;
  categoryId?: string;
  status: TemplateStatus;
}

interface NetdiskValues {
  provider: "baidu" | "quark";
  url: string;
  passcode?: string;
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
  const [netdiskEditing, setNetdiskEditing] = useState<AdminTemplate | null>(null);
  const [netdiskSaving, setNetdiskSaving] = useState(false);
  const [aiEditing, setAiEditing] = useState<AdminTemplate | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    analysis: AiAnalysis;
    matchedCategory: { key: string; name: string } | null;
  } | null>(null);
  const [form] = Form.useForm<EditValues>();
  const [netdiskForm] = Form.useForm<NetdiskValues>();

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

  const openNetdisk = (record: AdminTemplate) => {
    setNetdiskEditing(record);
    netdiskForm.setFieldsValue({
      provider: record.provider === "quark" ? "quark" : "baidu",
      url: record.netdiskUrl || "",
      passcode: record.passcode || ""
    });
  };

  const saveNetdisk = async () => {
    if (!netdiskEditing) return;
    try {
      const values = await netdiskForm.validateFields();
      setNetdiskSaving(true);
      await api.saveNetdisk(netdiskEditing.id, {
        provider: values.provider,
        url: values.url.trim(),
        passcode: values.passcode?.trim() || undefined
      });
      message.success("网盘链接已保存，短链已生成");
      setNetdiskEditing(null);
      await load();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error((error as Error).message);
    } finally {
      setNetdiskSaving(false);
    }
  };

  const removeNetdisk = async () => {
    if (!netdiskEditing) return;
    try {
      await api.removeNetdisk(netdiskEditing.id);
      message.success("已移除网盘链接");
      setNetdiskEditing(null);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const runAi = async (record: AdminTemplate) => {
    setAiLoading(true);
    try {
      const result = await api.annotateAi(record.id);
      setAiResult({ analysis: result.analysis, matchedCategory: result.matchedCategory });
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const openAi = (record: AdminTemplate) => {
    setAiEditing(record);
    setAiResult(record.ai ? { analysis: record.ai, matchedCategory: null } : null);
    void runAi(record);
  };

  const applyAi = async () => {
    if (!aiEditing) return;
    setAiApplying(true);
    try {
      await api.applyAi(aiEditing.id);
      message.success("已应用 AI 建议");
      setAiEditing(null);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setAiApplying(false);
    }
  };

  const batchAnnotate = async () => {
    setBatchLoading(true);
    try {
      const result = await api.batchAnnotate({ limit: 3 });
      if (result.total === 0) {
        message.info("没有待标注的已导入模板");
      } else {
        message.success(`AI 标注完成：成功 ${result.succeeded} / ${result.total} 个`);
      }
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBatchLoading(false);
    }
  };

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
      width: 180,
      render: (_code: string | null, record) =>
        record.shortCode ? (
          <div>
            <Tag color="blue">{PROVIDER_LABELS[record.provider || ""] || "网盘"}</Tag>
            <Typography.Text copyable={{ text: record.shortLink || "" }} style={{ fontSize: 12 }}>
              {record.shortCode}
            </Typography.Text>
            {record.passcode ? (
              <div style={{ color: "#8a90a6", fontSize: 12 }}>提取码 {record.passcode}</div>
            ) : null}
          </div>
        ) : (
          <Tag>未配置</Tag>
        )
    },
    {
      title: "AI",
      dataIndex: "ai",
      width: 190,
      render: (ai: AdminTemplate["ai"]) =>
        ai ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{ai.title || "已标注"}</div>
            <div style={{ color: "#8a90a6", fontSize: 12 }}>
              {ai.categoryKey || "-"} · {Math.round((ai.confidence || 0) * 100)}%
            </div>
          </div>
        ) : (
          <Tag>未标注</Tag>
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
          <Button type="link" size="small" onClick={() => openAi(record)}>
            AI
          </Button>
          <Button type="link" size="small" onClick={() => openNetdisk(record)}>
            网盘
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
        <Button onClick={() => { setStatus("pending_review"); setPage(1); }}>待复核</Button>
        <div style={{ flex: 1 }} />
        <Button loading={batchLoading} onClick={() => void batchAnnotate()}>
          AI 批量标注
        </Button>
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
        scroll={{ x: 1180 }}
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

      <Modal
        open={Boolean(netdiskEditing)}
        title="配置网盘链接"
        okText="保存"
        cancelText="取消"
        confirmLoading={netdiskSaving}
        onOk={() => void saveNetdisk()}
        onCancel={() => setNetdiskEditing(null)}
      >
        {netdiskEditing?.shortLink ? (
          <div style={{ marginBottom: 16, fontSize: 13 }}>
            <Typography.Text type="secondary">当前短链：</Typography.Text>
            <Typography.Text copyable={{ text: netdiskEditing.shortLink }}>
              {netdiskEditing.shortLink}
            </Typography.Text>
          </div>
        ) : null}
        <Form<NetdiskValues> form={netdiskForm} layout="vertical">
          <Form.Item name="provider" label="网盘类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "baidu", label: "百度网盘" },
                { value: "quark", label: "夸克网盘" }
              ]}
            />
          </Form.Item>
          <Form.Item
            name="url"
            label="分享链接"
            rules={[{ required: true, message: "请输入网盘分享链接" }]}
          >
            <Input placeholder="https://pan.baidu.com/s/..." maxLength={1000} />
          </Form.Item>
          <Form.Item name="passcode" label="提取码（可选）">
            <Input placeholder="如 abcd，没有可留空" maxLength={32} />
          </Form.Item>
        </Form>
        {netdiskEditing?.hasNetdisk ? (
          <Button danger onClick={() => void removeNetdisk()}>
            移除当前网盘链接
          </Button>
        ) : null}
        <div style={{ marginTop: 12, color: "#8a90a6", fontSize: 12, lineHeight: 1.7 }}>
          保存后自动生成短链，详情页「复制链接和提取码」会复制短链 + 提取码；短链 302 跳到真实网盘地址。
        </div>
      </Modal>

      <Modal
        open={Boolean(aiEditing)}
        title={aiEditing ? `AI 标注 · ${aiEditing.title}` : "AI 标注"}
        onCancel={() => setAiEditing(null)}
        footer={[
          <Button key="close" onClick={() => setAiEditing(null)}>
            关闭
          </Button>,
          <Button key="retry" loading={aiLoading} onClick={() => aiEditing && void runAi(aiEditing)}>
            重新标注
          </Button>,
          <Button
            key="apply"
            type="primary"
            loading={aiApplying}
            disabled={!aiResult || aiLoading}
            onClick={() => void applyAi()}
          >
            应用建议
          </Button>
        ]}
      >
        {aiLoading ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <Spin />
            <div style={{ marginTop: 12, color: "#8a90a6", fontSize: 13 }}>DeepSeek 正在阅读模板文字...</div>
          </div>
        ) : aiResult ? (
          <div className="ai-result">
            <div className="ai-row">
              <span>建议标题</span>
              <b>{aiResult.analysis.title || "-"}</b>
            </div>
            <div className="ai-row">
              <span>分类</span>
              <b>{aiResult.matchedCategory?.name || aiResult.analysis.categoryKey || "未匹配"}</b>
            </div>
            <div className="ai-row">
              <span>标签</span>
              <div>
                {aiResult.analysis.tags.length > 0
                  ? aiResult.analysis.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
                  : "-"}
              </div>
            </div>
            <div className="ai-row">
              <span>简介</span>
              <div>{aiResult.analysis.summary || "-"}</div>
            </div>
            <div className="ai-row">
              <span>置信度</span>
              <div>
                {Math.round((aiResult.analysis.confidence || 0) * 100)}%
                {aiResult.analysis.safe ? " · 内容安全" : " · 建议重点复核"}
                {aiResult.analysis.needsReview ? " · 待人工确认" : ""}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, color: "#8a90a6" }}>暂无 AI 结果，可点「重新标注」。</div>
        )}
      </Modal>
    </div>
  );
}
