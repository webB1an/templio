import { FORMAT_LABELS, resolveUrl, TemplateCard } from '../../utils/api';

Component({
  properties: {
    item: { type: Object, value: {} as TemplateCard },
  },
  methods: {
    onTap() {
      const item = this.data.item as TemplateCard;
      wx.navigateTo({ url: `/pages/detail/index?id=${item.id}` });
    },
  },
  observers: {
    item(v: TemplateCard) {
      this.setData({
        coverUrl: resolveUrl(v.cover),
        formatText: FORMAT_LABELS[v.format] ?? v.format,
        priceText: v.baseCreditPrice === 0 ? '免费' : `${v.baseCreditPrice} 积分`,
      });
    },
  },
  data: {
    coverUrl: '',
    formatText: '',
    priceText: '',
  },
});
