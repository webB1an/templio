import { Card, Col, Row, Statistic } from 'antd';

export function Dashboard() {
  return (
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Card>
          <Statistic title="资源总数" value={0} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="待审核" value={0} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="已发布" value={0} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="下架/封禁" value={0} />
        </Card>
      </Col>
    </Row>
  );
}
