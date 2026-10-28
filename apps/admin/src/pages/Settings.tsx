import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, InputNumber, Space, Switch, Tag, Typography, message } from 'antd';
import { api } from '../api';
import { PayConfig } from '../payTypes';

/**
 * 系统配置：功能开关 + 积分规则 + 支付模式展示。
 * 开关与规则同走 /admin/config（PATCH 保存）。
 */
export function Settings() {
  const [config, setConfig] = useState<PayConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setConfig(await api.get<PayConfig>('/admin/config'));
      } catch (e) {
        message.error(e instanceof Error ? e.message : '加载失败');
      }
    })();
  }, []);

  async function save(next?: Partial<PayConfig>) {
    if (!config) return;
    const payload = { ...config, ...next };
    setConfig(payload);
    setSaving(true);
    try {
      const res = await api.patch<PayConfig>('/admin/config', payload);
      setConfig(res);
      message.success('已保存，即时生效');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <Card loading />;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {config.mockPay && (
        <Alert
          type="warning"
          showIcon
          message="当前为 mock 支付模式"
          description="微信虚拟支付尚未接入（MOCK_PAY=true）。正式上线前需在微信后台创建商品、录入充值项并核验，然后在服务器 .env 中将 MOCK_PAY 改为 false 并重启服务。"
        />
      )}

      <Card title="功能开关" style={{ maxWidth: 560 }}>
        <Form layout="horizontal" labelCol={{ span: 6 }}>
          <Form.Item label="每日签到" extra="关闭后小程序签到接口返回「活动暂未开放」，不再发放签到积分">
            <Switch
              checked={config.checkin_enabled === 1}
              onChange={(v) => void save({ checkin_enabled: v ? 1 : 0 })}
            />
          </Form.Item>
          <Form.Item label="分享奖励" extra="关闭后分享打开不再给分享者计奖，也不发奖">
            <Switch
              checked={config.share_reward_enabled === 1}
              onChange={(v) => void save({ share_reward_enabled: v ? 1 : 0 })}
            />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          开关切换后立即保存生效。
        </Typography.Text>
      </Card>

      <Card title="积分规则" style={{ maxWidth: 560 }}>
        <Form layout="vertical">
          <Form.Item label="每日签到奖励（积分）" extra="签到并入积分页（PRD §3.4）">
            <InputNumber
              min={0}
              value={config.checkin_reward}
              onChange={(v) => setConfig({ ...config, checkin_reward: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="单次分享奖励（积分）">
            <InputNumber
              min={0}
              value={config.share_reward}
              onChange={(v) => setConfig({ ...config, share_reward: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="分享者单日奖励上限（积分）" extra="防刷：超过后当日不再计奖（PRD §3.5）">
            <InputNumber
              min={0}
              value={config.share_reward_daily_cap}
              onChange={(v) => setConfig({ ...config, share_reward_daily_cap: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存规则
          </Button>
        </Form>
      </Card>

      <Card title="AI 补全说明" style={{ maxWidth: 560 }}>
        <Space direction="vertical" size={4}>
          <Typography.Text>
            AI 智能补全（DeepSeek 视觉识别）入口在 <b>资源管理 → 编辑模板</b> 页：上传封面截图后点击
            「AI 补全」按钮，自动生成标题、摘要、分类、标签与建议积分价。
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            AI 仅生成建议，需人工确认后保存；发布与定价始终人工把关。
          </Typography.Text>
        </Space>
      </Card>

      <Card title="支付模式" style={{ maxWidth: 560 }}>
        当前模式：
        {config.mockPay ? <Tag color="warning">MOCK（模拟支付）</Tag> : <Tag color="success">微信虚拟支付</Tag>}
      </Card>
    </Space>
  );
}
