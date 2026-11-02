Component({
  properties: {
    item: {
      type: Object,
      value: {},
      observer(item) {
        const imageUrl =
          (item && item.coverUrl) ||
          (item && item.previewUrls && item.previewUrls.length ? item.previewUrls[0] : "") ||
          "";
        this.setData({ imageUrl });
      }
    },
    removable: { type: Boolean, value: false }
  },

  data: {
    imageUrl: ""
  },

  methods: {
    onOpen() {
      this.triggerEvent("open", { id: this.data.item && this.data.item.id });
    },
    onRemove() {
      this.triggerEvent("remove", { id: this.data.item && this.data.item.id });
    }
  }
});
