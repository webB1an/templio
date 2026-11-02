import { useEffect, useState } from "react";
import { Button, Card, Col, Row, Statistic, Table, Tag } from "antd";
import type { TableProps } from "antd";
import { api } from "../api";
import type { AdminTemplate, Stats, SystemStatus, TopTemplate } from "../types";
import { STATUS_META, formatTime } from "../utils";

function formatUptime(seconds: number): string {
  if (!seconds) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function backupText(backup: SystemStatus["backups"]["mysql"]): string {
  if (!backup) return "暂无备份";
  const age = backup.ageHours < 1 ? `${Math.round(backup.ageHours * 60)} 分钟前` : `${backup.ageHours.toFixed(1)} 小时前`;
  return `${backup.filename} · ${backup.sizeMb}MB · ${age}`;
}

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
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [recent, setRecent] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.stats(), api.templates({ limit: 6 }), api.system()])
      .then(([statsData, list, systemData]) => {
        setStats(statsData);
        setRecent(list.items);
        setSystem(systemData);
      })
      .finally(() => setLoading(false));
  }, []);

  const published = stats?.byStatus.published || 0;
  const archived = stats?.byStatus.archived || 0;
  const maxTrend = Math.max(
    1,
    ...(stats?.trend || []).flatMap((day) => [day.views, day.copies])
  );

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
        title="近 7 天浏览 / 下载"
        className="panel-card"
        extra={
          <span className="trend-legend">
            <i className="trend-dot trend-dot-views" /> 浏览
            <i className="trend-dot trend-dot-copies" /> 下载
          </span>
        }
      >
        <div className="trend-chart">
          {(stats?.trend || []).map((day) => (
            <div className="trend-day" key={day.date}>
              <div className="trend-bars">
                <div
                  className="trend-bar trend-bar-views"
                  style={{ height: `${Math.max(3, (day.views / maxTrend) * 100)}%` }}
                  title={`浏览 ${day.views}`}
                />
                <div
                  className="trend-bar trend-bar-copies"
                  style={{ height: `${Math.max(3, (day.copies / maxTrend) * 100)}%` }}
                  title={`下载 ${day.copies}`}
                />
              </div>
              <div className="trend-date">{day.date.slice(5)}</div>
              <div className="trend-num">
                {day.views}/{day.copies}
              </div>
            </div>
          ))}
        </div>
      </Card>

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

      <Card
        title="系统状态"
        className="panel-card"
        extra={
          <span style={{ fontSize: 12, color: "#8a90a6" }}>
            v{system?.version || "-"} @ {String(system?.commit || "dev").slice(0, 7)}
          </span>
        }
      >
        <div className="system-grid">
          <div className="system-item">
            <span>Node</span>
            <b>{system?.node || "-"} · {system?.platform || "-"}</b>
          </div>
          <div className="system-item">
            <span>运行时长</span>
            <b>{formatUptime(system?.uptimeSeconds || 0)}</b>
          </div>
          <div className="system-item">
            <span>内存 RSS</span>
            <b>{system?.memory.rssMb || 0} MB</b>
          </div>
          <div className="system-item">
            <span>磁盘</span>
            <b>
              {system?.disk.usedPercent || 0}% 已用 · 剩余 {system?.disk.freeGb || 0}G
            </b>
          </div>
          <div className="system-item">
            <span>数据库备份</span>
            <b style={{ color: (system?.backups.mysql?.ageHours || 0) > 26 ? "#dc2626" : undefined }}>
              {backupText(system?.backups.mysql || null)}
            </b>
          </div>
          <div className="system-item">
            <span>图片备份</span>
            <b style={{ color: (system?.backups.storage?.ageHours || 0) > 26 ? "#dc2626" : undefined }}>
              {backupText(system?.backups.storage || null)}
            </b>
          </div>
        </div>
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
