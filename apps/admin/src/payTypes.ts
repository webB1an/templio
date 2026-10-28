/** 积分支付相关类型 */

export interface PaymentOrderItem {
  id: number;
  orderNo: string;
  userId: number;
  openid: string;
  skuKey: string;
  skuSnapshot: Record<string, unknown>;
  amountFen: number;
  creditsSnapshot: number;
  status: 'created' | 'paid' | 'closed' | 'refunded';
  platformTxnId: string | null;
  createdAt: string;
  paidAt: string | null;
  user?: { id: number; openid: string };
}

export interface PaymentSkuItem {
  id: number;
  skuKey: string;
  name: string;
  description: string | null;
  wxProductId: string;
  wxPriceFen: number;
  credits: number;
  bonusCredits: number;
  badgeText: string | null;
  activityNote: string | null;
  enabled: boolean;
  verified: boolean;
  sort: number;
}

export interface PayConfig {
  checkin_reward: number;
  share_reward: number;
  share_reward_daily_cap: number;
  /** 功能开关：1 开 / 0 关 */
  checkin_enabled: number;
  share_reward_enabled: number;
  /** 只读：当前是否 mock 支付模式 */
  mockPay?: boolean;
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  created: 'processing',
  paid: 'success',
  closed: 'default',
  refunded: 'error',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  created: '待支付',
  paid: '已支付',
  closed: '已关闭',
  refunded: '已退款',
};
