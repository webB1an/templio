import { api, CategoryNode, TemplateCard } from '../../utils/api';

const DIMENSIONS = [
  { key: 'format', label: '格式' },
  { key: 'scene', label: '场景' },
  { key: 'audience', label: '人群' },
  { key: 'theme', label: '主题' },
];

interface DisplayCategory {
  id: number;
  name: string;
  children: { id: number; name: string }[];
}

Page({
  data: {
    dimensions: DIMENSIONS,
    activeDim: 'format',
    groups: [] as DisplayCategory[],
    activeCategoryId: 0,
    sort: 'latest',
    items: [] as TemplateCard[],
    page: 1,
    total: 0,
    loading: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const dim = query.dimension && DIMENSIONS.some((d) => d.key === query.dimension) ? query.dimension : 'format';
    this.setData({ activeDim: dim });
    void this.loadTree();
    void this.loadList(true);
  },

  async loadTree() {
    try {
      const tree = await api.categoryTree(this.data.activeDim);
      // 一级为组，二级为可选项
      const groups: DisplayCategory[] = [];
      for (const node of tree) {
        if (node.parentId === null) {
          groups.push({ id: node.id, name: node.name, children: [] });
        } else {
          const parent = groups.find((g) => g.id === node.parentId);
          if (parent) parent.children.push({ id: node.id, name: node.name });
        }
      }
      this.setData({ groups });
    } catch (e) {
      this.setData({ error: e instanceof Error ? e.message : '分类加载失败' });
    }
  },

  onDimTap(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    if (key === this.data.activeDim) return;
    this.setData({ activeDim: key, activeCategoryId: 0, groups: [] });
    void this.loadTree();
    void this.loadList(true);
  },

  onCategoryTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id) || 0;
    this.setData({ activeCategoryId: id });
    void this.loadList(true);
  },

  onSortTap(e: WechatMiniprogram.TouchEvent) {
    const sort = e.currentTarget.dataset.sort as string;
    if (sort === this.data.sort) return;
    this.setData({ sort });
    void this.loadList(true);
  },

  async loadList(reset: boolean) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const res = await api.templates({
        categoryId: this.data.activeCategoryId || undefined,
        sort: this.data.sort,
        page,
        pageSize: 10,
      });
      this.setData({
        loading: false,
        error: '',
        items: reset ? res.items : [...this.data.items, ...res.items],
        page,
        total: res.total,
      });
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '加载失败' });
    }
  },

  onReachBottom() {
    if (this.data.items.length < this.data.total && !this.data.loading) {
      void this.loadList(false);
    }
  },

  onPullDownRefresh() {
    void Promise.all([this.loadTree(), this.loadList(true)]).then(() => wx.stopPullDownRefresh());
  },
});
