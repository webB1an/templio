import { api, ensureLogin, getUserToken } from '../../utils/api';

Page({
  data: {
    loggedIn: false,
    nickname: '',
    balance: 0,
    totalEarned: 0,
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    const hasToken = !!getUserToken();
    const ok = hasToken || (await ensureLogin());
    if (!ok) {
      this.setData({ loggedIn: false, nickname: '', balance: 0, totalEarned: 0 });
      return;
    }
    try {
      const [me, account] = await Promise.all([api.me(), api.creditAccount()]);
      this.setData({
        loggedIn: true,
        nickname: me.nickname || `模板用户 ${me.id}`,
        balance: account.balance,
        totalEarned: account.totalEarned,
      });
    } catch {
      this.setData({ loggedIn: false });
    }
  },

  async onLoginTap() {
    const ok = await ensureLogin();
    wx.showToast({ title: ok ? '已登录' : '登录失败', icon: ok ? 'success' : 'none' });
    if (ok) void this.refresh();
  },

  goCredits() {
    wx.switchTab({ url: '/pages/credits/index' });
  },

  onShareAppMessage() {
    const uid = wx.getStorageSync('templio_user_id') as number;
    return {
      title: '万用模板 · 办公学习生活模板一键获取',
      path: uid ? `/pages/home/index?sharerId=${uid}` : '/pages/home/index',
    };
  },
});
