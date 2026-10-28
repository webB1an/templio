import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, message } from 'antd';
import { api } from '../api';
import { TemplateListResult } from '../types';

interface StatItem {
  title: string;
  value: number | null;
}

export function Dashboard() {
  const [stats, setStats] = useState<StatItem[]>([
    { title: '资源总数', value: null },
    { title: '待审核', value: null },
    { title: '已发布', value: null },
    { title: '已驳回', value: null },
  ]);

  useEffect(() => {
    void (async () => {
      try {
        const fetchTotal = async (status?: string) => {
          const params = new URLSearchParams({ page: '1', pageSize: '1' });
          if (status) params.set('status', status);
          const res = await api.get<TemplateListResult>(`/admin/templates?${params.toString()}`);
          return res.total;
        };
        const [total, pending, published, rejected] = await Promise.all([
          fetchTotal(),
          fetchTotal('pending_review'),
          fetchTotal('published'),
          fetchTotal('rejected'),
        ]);
        setStats([
          { title: '资源总数', value: total },
          { title: '待审核', value: pending },
          { title: '已发布', value: published },
          { title: '已驳回', value: rejected },
        ]);
      } catch (e) {
        message.warning(e instanceof Error ? `统计加载失败：${e.message}` : '统计加载失败');
        setStats((s) => s.map((x) => ({ ...x, value: 0 })));
      }
    })();
  }, []);

  return (
    <Row gutter={[16, 16]}>
      {stats.map((s) => (
        <Col span={6} key={s.title}>
          <Card>
            <Statistic title={s.title} value={s.value ?? '-'} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
