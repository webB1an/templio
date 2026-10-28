import { Button, Card, Form, Input, Typography } from 'antd';

export function Login() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F4F7FF',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={4} style={{ color: '#245BFF' }}>
          万用模板 · 管理后台
        </Typography.Title>
        <Form layout="vertical" onFinish={() => undefined}>
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input placeholder="管理员用户名" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
            登录鉴权随 M1 落地（多管理员账号，密码哈希 + 登录限速）
          </Typography.Text>
        </Form>
      </Card>
    </div>
  );
}
