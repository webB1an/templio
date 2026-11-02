Component({
  properties: {
    item: { type: Object, value: {} },
    removable: { type: Boolean, value: false }
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
