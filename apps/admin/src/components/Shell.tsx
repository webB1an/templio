import { useState } from "react";
import { Button, Layout, Menu, Typography } from "antd";
import Dashboard from "../pages/Dashboard";
import Templates from "../pages/Templates";

const { Header, Sider, Content } = Layout;

type PageKey = "dashboard" | "templates";

export default function Shell({ onLogout }: { onLogout: () => void }) {
  const [page, setPage] = useState<PageKey>("dashboard");

  return (
    <Layout className="shell">
      <Sider width={220} theme="light" className="sider">
        <div className="brand">
          模板宝 <span>管理端</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[page]}
          onClick={(info) => setPage(info.key as PageKey)}
          items={[
            { key: "dashboard", label: "概览" },
            { key: "templates", label: "模板库" }
          ]}
        />
      </Sider>
      <Layout>
        <Header className="header">
          <Typography.Text strong>内容运营中台</Typography.Text>
          <Button onClick={onLogout}>退出登录</Button>
        </Header>
        <Content className="content">
          {page === "dashboard" ? (
            <Dashboard onOpenTemplates={() => setPage("templates")} />
          ) : (
            <Templates />
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
