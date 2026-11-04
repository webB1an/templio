import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  InputNumber,
  Space,
  Switch,
  Tag,
  Typography,
  message
} from "antd";
import { api } from "../api";
import type { AiAutoStatus } from "../types";
import { formatTime } from "../utils";

export default function Settings() {
  const [status, setStatus] = useState<AiAutoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confidenceInput, setConfidenceInput] = useState<number | null>(null);
  const [savingConfidence, setSavingConfidence] = useState(false);
  const confidenceInitialized = useRef(false);

  const load = async () => {
    try {
      const next = await api.aiAutoStatus();
      setStatus(next);
      if (!confidenceInitialized.current) {
        setConfidenceInput(Math.round(next.minConfidence * 100));
        confidenceInitialized.current = true;
      }
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
      await api.updateAiAuto({ enabled });
      message.success(enabled ? "已开启 DeepSeek 平价时段自动处理" : "已关闭 DeepSeek 平价时段自动处理");
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveConfidence = async () => {
    if (confidenceInput === null || !Number.isFinite(confidenceInput)) {
      message.warning("请输入 50–100 之间的置信度");
      return;
    }
    const percent = Math.min(100, Math.max(50, Math.round(confidenceInput)));
    setSavingConfidence(true);
    try {
      await api.updateAiAuto({ minConfidence: percent / 100 });
      message.success(`自动应用置信度已改为 ${percent}%`);
      setConfidenceInput(percent);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSavingConfidence(false);
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
          <Descriptions.Item label="待重新分类">
            {status?.reclassifyCount ?? "-"} 个
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

        <Divider style={{ margin: "20px 0 16px" }} />

        <Space wrap align="center">
          <Typography.Text strong>自动应用置信度</Typography.Text>
          <InputNumber
            min={50}
            max={100}
            step={1}
            value={confidenceInput}
            onChange={(value) => setConfidenceInput(typeof value === "number" ? value : null)}
            addonAfter="%"
            style={{ width: 130 }}
          />
          <Button type="primary" loading={savingConfidence} onClick={() => void saveConfidence()}>
            保存阈值
          </Button>
          <Typography.Text type="secondary">当前生效：{status ? `${Math.round(status.minConfidence * 100)}%` : "-"}</Typography.Text>
        </Space>

        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          阈值越低，自动应用 AI 标题/分类的模板越多；低于阈值的 AI 结果仍会保存分析，但保留人工复核，不会自动应用。
          修改后自动任务会在下一次模板处理时生效。
        </Typography.Paragraph>

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
