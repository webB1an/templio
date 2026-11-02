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
        this.setData({
          imageUrl,
          formatLabel: (item && item.formatLabel) || shortFormat(item && item.format),
          viewCountText: (item && item.viewCountText) || shortCount(item && item.viewCount)
        });
      }
    },
    removable: { type: Boolean, value: false }
  },

  data: {
    imageUrl: "",
    formatLabel: "文件",
    viewCountText: ""
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

function shortFormat(value) {
  const format = String(value || "").toUpperCase();
  if (format === "PPTX" || format === "PPT") return "PPT";
  if (format === "DOCX" || format === "DOC") return "Word";
  if (format === "XLSX" || format === "XLS") return "Excel";
  return format || "文件";
}

function shortCount(value) {
  const count = Number(value || 0);
  if (!count || count <= 0) return "";
  if (count >= 10000) return `${(count / 10000).toFixed(1)}w`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}
