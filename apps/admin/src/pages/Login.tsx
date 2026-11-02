import { useState } from "react";
import { Button, Form, Input, message } from "antd";
import { api, setToken } from "../api";

interface LoginValues {
  username: string;
  password: string;
}

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginValues) => {
    setLoading(true);
    try {
      const result = await api.login(values.username.trim(), values.password);
      setToken(result.token);
      message.success("登录成功");
      onSuccess();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          模板宝 <span>管理端</span>
        </div>
        <div className="login-sub">PPT / Word 模板库 · 内容运营中台</div>
        <Form<LoginValues> layout="vertical" initialValues={{ username: "admin" }} onFinish={onFinish}>
          <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
            <Input size="large" placeholder="admin" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password
              size="large"
              placeholder="服务器 .env 中的 ADMIN_PASSWORD"
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            登录
          </Button>
        </Form>
        <div className="login-tip">账号密码在服务器 apps/api/.env 中配置</div>
      </div>
    </div>
  );
}
