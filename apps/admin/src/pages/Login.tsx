import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { api, setSession, type AdminProfile } from '../api';

interface LoginResponse {
  accessToken: string;
  profile: AdminProfile;
}

export function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function onFinish(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/admin/auth/login', values);
      setSession(res.accessToken, res.profile);
      navigate('/admin/dashboard', { replace: true });
    } catch (e) {
      message.error(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

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
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="管理员用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
