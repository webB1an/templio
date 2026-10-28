import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Dropdown, Layout, Menu, Typography } from 'antd';
import {
  LayoutDashboard,
  FolderOpen,
  Tags,
  CreditCard,
  Users,
  Settings,
  LogOut,
  HardDrive,
} from 'lucide-react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Templates } from './pages/Templates';
import { TemplateEdit } from './pages/TemplateEdit';
import { BatchImport } from './pages/BatchImport';
import { Categories } from './pages/Categories';
import { Payments } from './pages/Payments';
import { Settings as SettingsPage } from './pages/Settings';
import { Netdisk } from './pages/Netdisk';
import { Complaints } from './pages/Complaints';
import { clearSession, getProfile } from './api';

const { Sider, Content, Header } = Layout;

// 菜单 key 统一带 /admin 前缀，与路由路径一致
const menuItems = [
  { key: '/admin/dashboard', icon: <LayoutDashboard size={16} />, label: '工作台' },
  { key: '/admin/templates', icon: <FolderOpen size={16} />, label: '资源管理' },
  { key: '/admin/categories', icon: <Tags size={16} />, label: '分类标签' },
  { key: '/admin/netdisk', icon: <HardDrive size={16} />, label: '网盘管理' },
  { key: '/admin/payments', icon: <CreditCard size={16} />, label: '订单积分' },
  { key: '/admin/users', icon: <Users size={16} />, label: '用户投诉' },
  { key: '/admin/settings', icon: <Settings size={16} />, label: '系统配置' },
];

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = getProfile();

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogOut size={14} />,
        label: '退出登录',
        onClick: () => {
          clearSession();
          navigate('/admin/login', { replace: true });
        },
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={200}>
        <div style={{ padding: '16px 24px' }}>
          <Typography.Text strong style={{ color: '#245BFF', fontSize: 16 }}>
            万用模板
          </Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography.Text type="secondary">管理后台</Typography.Text>
          <Dropdown menu={userMenu}>
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size={28} style={{ background: '#245BFF' }}>
                {(profile?.username ?? '?').slice(0, 1).toUpperCase()}
              </Avatar>
              <Typography.Text>
                {profile?.username}
                {profile?.role === 'super' ? '（超管）' : ''}
              </Typography.Text>
            </span>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

/** 路由守卫：未登录跳转登录页 */
function RequireAuth() {
  return getProfile() && localStorage.getItem('templio_admin_token') ? (
    <Outlet />
  ) : (
    <Navigate to="/admin/login" replace />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<Login />} />
      {/* 嵌套路由：子路径相对 /admin，避免双层 Routes 互相重定向 */}
      <Route path="/admin" element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="templates" element={<Templates />} />
          <Route path="templates/new" element={<TemplateEdit />} />
          <Route path="templates/batch" element={<BatchImport />} />
          <Route path="templates/:id" element={<TemplateEdit />} />
          <Route path="categories" element={<Categories />} />
          <Route path="netdisk" element={<Netdisk />} />
          <Route path="payments" element={<Payments />} />
          <Route path="users" element={<Complaints />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
