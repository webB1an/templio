import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import {
  LayoutDashboard,
  FolderOpen,
  Tags,
  CreditCard,
  Users,
  Settings,
} from 'lucide-react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

const { Sider, Content, Header } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <LayoutDashboard size={16} />, label: '工作台' },
  { key: '/templates', icon: <FolderOpen size={16} />, label: '资源管理' },
  { key: '/categories', icon: <Tags size={16} />, label: '分类标签' },
  { key: '/payments', icon: <CreditCard size={16} />, label: '订单积分' },
  { key: '/users', icon: <Users size={16} />, label: '用户投诉' },
  { key: '/settings', icon: <Settings size={16} />, label: '系统配置' },
];

function Shell() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={200}>
        <div style={{ padding: '16px 24px' }}>
          <Typography.Text strong style={{ color: '#245BFF', fontSize: 16 }}>
            万用模板
          </Typography.Text>
        </div>
        <Menu mode="inline" defaultSelectedKeys={['/dashboard']} items={menuItems} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px' }}>
          <Typography.Text type="secondary">管理后台（M0 骨架，功能随里程碑落地）</Typography.Text>
        </Header>
        <Content style={{ padding: 24 }}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        {/* M1 起接入真实管理员鉴权，当前骨架直接进入 */}
        <Route path="/admin" element={<Shell />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
