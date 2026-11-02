import { useEffect, useState } from "react";
import {
  Alert,
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
  Tag,
  Typography,
  message
} from "antd";
import type { TableProps } from "antd";
import { api } from "../api";
import type { NetdiskProvider, StorageAccount } from "../types";
import { formatTime } from "../utils";

const PROVIDER_TEXT: Record<NetdiskProvider, string> = {
  baidu: "百度网盘",
  quark: "夸克网盘"
};

export default function StorageAccounts() {
  const [items, setItems] = useState<StorageAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [createForm] = Form.useForm<{ provider: NetdiskProvider; label: string; isDefault: boolean }>();
  const [createOpen, setCreateOpen] = useState(false);
  const [authTarget, setAuthTarget] = useState<StorageAccount | null>(null);
  const [authUrl, setAuthUrl] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [cookieText, setCookieText] = useState("");
  const [busy, setBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<StorageAccount | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = () => {
    setLoading(true);
    api
      .storageAccounts()
      .then(setItems)
      .catch((error) => message.error((error as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = (provider: NetdiskProvider) => {
    createForm.setFieldsValue({ provider, label: "", isDefault: false });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    try {
      const values = await createForm.validateFields();
      await api.createStorageAccount(values);
      message.success("账号已创建，请继续授权");
      setCreateOpen(false);
      load();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error((error as Error).message);
    }
  };

  const setDefault = async (account: StorageAccount) => {
    try {
      await api.setDefaultStorageAccount(account.id);
      message.success(`已设为默认${PROVIDER_TEXT[account.provider]}`);
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const probe = async (account: StorageAccount) => {
    setBusy(true);
    try {
      const result = await api.probeStorageAccount(account.id);
      if (result.lastProbeOk) message.success("探活成功");
      else message.warning(result.lastProbeMessage || "探活失败");
      load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openAuth = async (account: StorageAccount) => {
    setAuthTarget(account);
    setAuthUrl("");
    setAuthCode("");
    setCookieText("");
    if (account.provider === "quark") {
      setBusy(true);
      try {
        const result = await api.startQuarkAuth(account.id);
        if ("authUrl" in result && result.authUrl) setAuthUrl(result.authUrl);
        else {
          message.success("账号已授权");
          setAuthTarget(null);
          load();
        }
      } catch (error) {
        message.error((error as Error).message);
      } finally {
        setBusy(false);
      }
    }
  };

  const finishAuth = async () => {
    if (!authTarget) return;
    setBusy(true);
    try {
      if (authTarget.provider === "baidu") {
        await api.saveBaiduCookie(authTarget.id, cookieText.trim());
      } else {
        await api.finishQuarkAuth(authTarget.id, authCode.trim());
      }
      message.success("授权完成");
      setAuthTarget(null);
      load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (account: StorageAccount) => {
    try {
      await api.deleteStorageAccount(account.id);
      message.success("账号已删除");
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    try {
      await api.updateStorageAccount(renameTarget.id, { label: renameValue.trim() });
      message.success("名称已更新");
      setRenameTarget(null);
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: NonNullable<TableProps<StorageAccount>["columns"]> = [
    { title: "名称", dataIndex: "label" },
    {
      title: "类型",
      dataIndex: "provider",
      width: 120,
      render: (provider: NetdiskProvider) => (
        <Tag color={provider === "quark" ? "green" : "blue"}>{PROVIDER_TEXT[provider]}</Tag>
      )
    },
    {
      title: "授权账号",
      dataIndex: "accountName",
      render: (value: string | null) => value || <span style={{ color: "#8a90a6" }}>未识别</span>
    },
    {
      title: "默认",
      dataIndex: "isDefault",
      width: 80,
      render: (value: boolean) => (value ? <Tag color="gold">默认</Tag> : null)
    },
    {
      title: "状态",
      width: 100,
      render: (_value, record) =>
        record.lastProbeOk === null ? (
          <Tag>未探活</Tag>
        ) : record.lastProbeOk ? (
          <Tag color="green">可用</Tag>
        ) : (
          <Tag color="red">不可用</Tag>
        )
    },
    {
      title: "最近探活",
      render: (_value, record) => (
        <div style={{ fontSize: 12, color: "#8a90a6" }}>
          {record.lastProbeMessage || "暂无"}
          <div>{record.lastProbeAt ? formatTime(record.lastProbeAt) : ""}</div>
        </div>
      )
    },
    {
      title: "操作",
      width: 380,
      render: (_value, record) => (
        <Space wrap size={4}>
          {record.isDefault ? null : (
            <Button size="small" onClick={() => setDefault(record)}>
              设为默认
            </Button>
          )}
          <Button size="small" loading={busy && authTarget?.id === record.id} onClick={() => void openAuth(record)}>
            授权
          </Button>
          <Button size="small" onClick={() => void probe(record)}>
            探活
          </Button>
          <Button
            size="small"
            onClick={() => {
              setRenameTarget(record);
              setRenameValue(record.label);
            }}
          >
            改名
          </Button>
          <Popconfirm
            title="删除这个网盘账号？"
            description="已有网盘链接的账号会被停用并清理授权文件，历史链接不受影响。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void remove(record)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const readiness = (["quark", "baidu"] as NetdiskProvider[]).map((provider) => {
    const accounts = items.filter((item) => item.provider === provider);
    const defaultAccount = accounts.find((item) => item.isDefault);
    const usable = accounts.some((item) => item.lastProbeOk);
    return { provider, accounts, defaultAccount, usable };
  });

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="在线绑定百度 / 夸克网盘账号"
        description="百度：从浏览器 pan.baidu.com 请求头复制含 BAIDUID 的 Cookie；夸克：通过 Skill 授权码登录。每种网盘第一个账号自动设为默认，上传同步默认使用默认账号。"
        style={{ marginBottom: 16 }}
      />

      <div className="storage-readiness">
        {readiness.map((item) => (
          <Card key={item.provider} className="stat-card" size="small">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <Typography.Text strong>{PROVIDER_TEXT[item.provider]}</Typography.Text>
                <div style={{ fontSize: 12, color: "#8a90a6", marginTop: 4 }}>
                  {item.defaultAccount ? `默认：${item.defaultAccount.label}` : "缺默认账号"}
                  {item.accounts.length > 0 ? ` · ${item.accounts.length} 个账号` : ""}
                  {item.usable ? " · 已探活" : " · 待授权"}
                </div>
              </div>
              <Button type="primary" size="small" onClick={() => openCreate(item.provider)}>
                新增账号
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card title="网盘账号列表" className="panel-card">
        <Table<StorageAccount>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title="新增网盘账号"
        open={createOpen}
        okText="保存"
        cancelText="取消"
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="provider" label="网盘类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "quark", label: "夸克网盘" },
                { value: "baidu", label: "百度网盘" }
              ]}
            />
          </Form.Item>
          <Form.Item name="label" label="账号名称" rules={[{ required: true, message: "请输入账号名称" }]}>
            <Input placeholder="例如：夸克主号 / 百度备用号" maxLength={64} />
          </Form.Item>
          <Form.Item name="isDefault" label="设为默认" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={authTarget ? `${PROVIDER_TEXT[authTarget.provider]}授权` : "网盘授权"}
        open={Boolean(authTarget)}
        okText="完成授权"
        cancelText="取消"
        confirmLoading={busy}
        onOk={() => void finishAuth()}
        onCancel={() => setAuthTarget(null)}
      >
        {authTarget?.provider === "quark" ? (
          <div>
            {authUrl ? (
              <Alert
                type="info"
                showIcon
                message="打开授权链接，登录后把授权码粘贴到下方"
                description={<Typography.Text copyable>{authUrl}</Typography.Text>}
                style={{ marginBottom: 12 }}
              />
            ) : null}
            <Input.TextArea
              rows={3}
              value={authCode}
              onChange={(event) => setAuthCode(event.target.value)}
              placeholder="粘贴夸克授权码或完整回调 URL"
            />
          </div>
        ) : (
          <div>
            <Alert
              type="info"
              showIcon
              message="从浏览器登录 pan.baidu.com，打开开发者工具，复制任意请求的 Cookie（需包含 BAIDUID）"
              style={{ marginBottom: 12 }}
            />
            <Input.TextArea
              rows={5}
              value={cookieText}
              onChange={(event) => setCookieText(event.target.value)}
              placeholder="BAIDUID=...; BDUSS=...; STOKEN=..."
            />
          </div>
        )}
      </Modal>

      <Modal
        title="修改账号名称"
        open={Boolean(renameTarget)}
        okText="保存"
        cancelText="取消"
        onOk={() => void submitRename()}
        onCancel={() => setRenameTarget(null)}
      >
        <Form layout="vertical">
          <Form.Item label="账号名称" required>
            <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={64} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
