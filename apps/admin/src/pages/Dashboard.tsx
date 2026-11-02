import { useEffect, useState } from "react";
import { Button, Card, Col, Row, Statistic, Table, Tag } from "antd";
import type { TableProps } from "antd";
import { api } from "../api";
import type { AdminTemplate, Stats, TopTemplate } from "../types";
import { STATUS_META, formatTime } from "../utils";

const recentColumns: NonNullable<TableProps<AdminTemplate>["columns"]> = [
  { title: "模板标题", dataIndex: "title", ellipsis: true },
  {
    title: "状态",
    dataIndex: "status",
    width: 120,
    render: (status: string) => {
      const meta = STATUS_META[status] || { label: status, color: "default" };
      return <Tag color={meta.color}>{meta.label}</Tag>;
    }
  },
  {
    title: "分类",
    dataIndex: "category",
    width: 120,
    render: (category: AdminTemplate["category"]) => category?.name || "-"
  },
  { title: "更新时间", dataIndex: "updatedAt", width: 180, render: (value: string) => formatTime(value) }
];

const topColumns: NonNullable<TableProps<TopTemplate>["columns"]> = [
  {
    title: "模板",
    dataIndex: "title",
    render: (title: string, record) => (
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {record.coverUrl ? (
          <img
            src={record.coverUrl}
            alt=""
            style={{ width: 34, height: 45, objectFit: "cover", borderRadius: 5, flex: "none" }}
          />
        ) : null}
        <span>{title}</span>
      </div>
    )
  },
  { title: "分类", dataIndex: "category", width: 120 },
  { title: "浏览", dataIndex: "viewCount", width: 90 },
  { title: "下载", dataIndex: "copyCount", width: 90 },
  { title: "收藏", dataIndex: "favoriteCount", width: 90 }
];

export default function Dashboard({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.stats(), api.templates({ limit: 6 })])
      .then(([statsData, list]) => {
        setStats(statsData);
        setRecent(list.items);
      })
      .finally(() => setLoading(false));
  }, []);

  const published = stats?.byStatus.published || 0;
  const archived = stats?.byStatus.archived || 0;

  return (
    <div>
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic title="模板总数" value={stats?.total || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic title="已上架" value={published} valueStyle={{ color: "#16a34a" }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic
              title="待复核"
              value={stats?.pendingReview || 0}
              valueStyle={{ color: "#d97706" }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic title="已下架" value={archived} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic title="总浏览" value={stats?.views || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic title="总下载" value={stats?.copies || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic title="总收藏" value={stats?.favorites || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card">
            <Statistic
              title="今日互动"
              value={stats?.today.clicks || 0}
              suffix={
                <span style={{ fontSize: 12, color: "#8a90a6" }}>
                  浏览 {stats?.today.views || 0} / 下载 {stats?.today.copies || 0}
                </span>
              }
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="热门模板"
        className="panel-card"
        extra={
          <Button type="link" onClick={onOpenTemplates}>
            进入模板库
          </Button>
        }
      >
        <Table<TopTemplate>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={topColumns}
          dataSource={stats?.topTemplates || []}
          pagination={false}
        />
      </Card>

      <Card title="最近更新" className="panel-card">
        <Table<AdminTemplate>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={recentColumns}
          dataSource={recent}
          pagination={false}
        />
      </Card>

      <Card title="分类分布" className="panel-card">
        <div className="category-list">
          {(stats?.categories || []).map((item) => (
            <div key={item.key} className="category-item">
              <span>{item.name}</span>
              <Tag>{item.count} 个模板</Tag>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
