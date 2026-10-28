import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
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

// 菜单 key 统一带 /admin 前缀，与路由路径一致
const menuItems = [
  { key: '/admin/dashboard', icon: <LayoutDashboard size={16} />, label: '工作台' },
  { key: '/admin/templates', icon: <FolderOpen size={16} />, label: '资源管理' },
  { key: '/admin/categories', icon: <Tags size={16} />, label: '分类标签' },
  { key: '/admin/payments', icon: <CreditCard size={16} />, label: '订单积分' },
  { key: '/admin/users', icon: <Users size={16} />, label: '用户投诉' },
  { key: '/admin/settings', icon: <Settings size={16} />, label: '系统配置' },
];

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
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
        <Header style={{ background: '#fff', padding: '0 24px' }}>
          <Typography.Text type="secondary">管理后台（M0 骨架，功能随里程碑落地）</Typography.Text>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
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
        {/* 嵌套路由：子路径相对 /admin，避免双层 Routes 互相重定向 */}
        <Route path="/admin" element={<Shell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
