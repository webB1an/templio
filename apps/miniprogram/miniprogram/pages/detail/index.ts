Page({
  data: {
    title: '',
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ title: decodeURIComponent(query.title || '模板详情') });
  },
});
