import { api, ensureLogin, getUserToken, clearUserToken } from '../../utils/api';

interface SkuView {
  skuKey: string;
  name: string;
  credits: number;
  bonusCredits: number;
  priceText: string;
  badgeText: string | null;
  total: number;
}

interface LedgerView {
  id: number;
  typeText: string;
  amountText: string;
  balanceAfter: number;
  reason: string | null;
  timeText: string;
}

const TYPE_LABELS: Record<string, string> = {
  recharge: '充值',
  gift: '赠送',
  checkin: '签到',
  share_reward: '分享奖励',
  unlock_deduct: '解锁模板',
  admin_adjust: '系统调整',
  refund_deduct: '退款扣减',
};

Page({
  data: {
    loggedIn: false,
    balance: 0,
    checkedInToday: false,
    checkinLoading: false,
    skus: [] as SkuView[],
    ledger: [] as LedgerView[],
    paying: '',
    nickname: '',
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    const ok = await ensureLogin();
    if (!ok) {
      this.setData({ loggedIn: false });
      return;
    }
    this.setData({ loggedIn: true });
    try {
      const [account, skus, ledgerRes] = await Promise.all([
        api.creditAccount(),
        api.skus().catch(() => []),
        api.creditLedger().catch(() => ({ items: [] })),
      ]);
      this.setData({
        balance: account.balance,
        checkedInToday: account.checkedInToday,
        skus: skus.map((s) => ({
          skuKey: s.skuKey,
          name: s.name,
          credits: s.credits,
          bonusCredits: s.bonusCredits,
          priceText: `¥${(s.wxPriceFen / 100).toFixed(2)}`,
          badgeText: s.badgeText,
          total: s.credits + s.bonusCredits,
        })),
        ledger: ledgerRes.items.map((l) => ({
          id: l.id,
          typeText: TYPE_LABELS[l.type] ?? l.type,
          amountText: l.amount >= 0 ? `+${l.amount}` : `${l.amount}`,
          balanceAfter: l.balanceAfter,
          reason: l.reason,
          timeText: new Date(l.createdAt).toLocaleDateString(),
        })),
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'NEED_LOGIN') {
        clearUserToken();
        this.setData({ loggedIn: false });
      }
    }
  },

  /** 静默登录成功后刷新 */
  async onLoginTap() {
    const ok = await ensureLogin();
    wx.showToast({ title: ok ? '已登录' : '登录失败', icon: ok ? 'success' : 'none' });
    if (ok) void this.refresh();
  },

  async onCheckin() {
    if (this.data.checkedInToday || this.data.checkinLoading) return;
    this.setData({ checkinLoading: true });
    try {
      const res = await api.checkin();
      wx.showToast({ title: `签到成功 +${res.reward}`, icon: 'success' });
      this.setData({ checkedInToday: true, balance: res.balance });
      void this.refresh();
    } catch (e) {
      wx.showToast({ title: e instanceof Error ? e.message : '签到失败', icon: 'none' });
    } finally {
      this.setData({ checkinLoading: false });
    }
  },

  /** 充值：创建订单 → mock 支付（真实虚拟支付上线后替换为 wx.requestVirtualPayment） */
  async onSkuTap(e: WechatMiniprogram.TouchEvent) {
    const skuKey = e.currentTarget.dataset.sku as string;
    if (!getUserToken()) {
      const ok = await ensureLogin();
      if (!ok) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
    }
    if (this.data.paying) return;
    this.setData({ paying: skuKey });
    try {
      const order = await api.createOrder(skuKey);
      if (order.mockMode) {
        const res = await api.mockPay(order.orderNo);
        wx.showToast({ title: `充值成功 +${res.credits} 积分`, icon: 'success' });
        void this.refresh();
      } else {
        wx.showToast({ title: '微信支付暂未开通', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: err instanceof Error ? err.message : '充值失败', icon: 'none' });
    } finally {
      this.setData({ paying: '' });
    }
  },
});
