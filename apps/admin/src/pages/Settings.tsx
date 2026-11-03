import { useEffect, useState } from "react";
import { Alert, Card, Descriptions, Space, Switch, Tag, Typography, message } from "antd";
import { api } from "../api";
import type { AiAutoStatus } from "../types";
import { formatTime } from "../utils";

export default function Settings() {
  const [status, setStatus] = useState<AiAutoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setStatus(await api.aiAutoStatus());
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await api.setAiAutoEnabled(enabled);
      message.success(enabled ? "已开启 DeepSeek 平价时段自动处理" : "已关闭 DeepSeek 平价时段自动处理");
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        系统设置
      </Typography.Title>

      <Card
        title="DeepSeek 平价时段自动处理"
        extra={
          <Space>
            <Typography.Text type="secondary">{saving ? "保存中…" : ""}</Typography.Text>
            <Switch
              checked={Boolean(status?.enabled)}
              loading={saving || loading}
              onChange={(value) => void toggle(value)}
              checkedChildren="开启"
              unCheckedChildren="关闭"
            />
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="开启后，系统只在 DeepSeek 空闲/平价时段自动处理未 AI 标注的模板"
          description={
            <span>
              工作日平价时段：00:00–09:00、12:00–14:00、18:00–24:00；周末和法定节假日全天。
              高峰时段：工作日 09:00–12:00、14:00–18:00。低置信度结果不会自动应用，会留给人工复核。
            </span>
          }
          style={{ marginBottom: 18 }}
        />

        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="开关">
            {status?.enabled ? <Tag color="green">已开启</Tag> : <Tag>已关闭</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="当前时段">
            {status?.offpeak ? <Tag color="blue">平价时段</Tag> : <Tag color="orange">高峰时段</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="执行状态">
            {status?.running ? <Tag color="processing">执行中</Tag> : status?.enabled ? "等待平价时段" : "未执行"}
          </Descriptions.Item>
          <Descriptions.Item label="待 AI 标注">
            <strong>{status?.pendingCount ?? "-"}</strong> 个模板
          </Descriptions.Item>
          <Descriptions.Item label="可直接应用结果">
            {status?.readyApplyCount ?? "-"} 个
          </Descriptions.Item>
          <Descriptions.Item label="置信度阈值">
            {status ? `${Math.round((status.minConfidence || 0) * 100)}%` : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="调用间隔">
            {status ? `${Math.round((status.delayMs || 0) / 1000)} 秒/个` : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="本次启动已处理">
            {status?.processedTotal ?? "-"} 个
          </Descriptions.Item>
          <Descriptions.Item label="最近处理时间">
            {status?.lastProcessedAt ? formatTime(status.lastProcessedAt) : "-"}
          </Descriptions.Item>
        </Descriptions>

        {status?.lastError ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
            message="最近一次自动处理异常"
            description={status.lastError}
          />
        ) : null}

        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          开关状态会持久化到数据库，服务器重启后仍然生效。自动任务每次只处理一个模板，避免 2C2G 服务器并发压力；
          应用 AI 结果会更新标题、分类、标签和简介。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
