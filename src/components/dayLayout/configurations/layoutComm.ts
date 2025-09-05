// Layouts for when comm data is available but no video (rows 17-24 from CSV)
export const commLayouts: Record<string, LayoutConfiguration> = {
  "comm-eva-article-photo": {
    conditions: { video: false, comm: true, eva: true, article: true, photo: true },
    layout: {
      left: [
        { type: "eva", styleClass: "componentNaturalSize" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [
        { type: "comm", styleClass: "componentExpandable" },
        { type: "globe", styleClass: "componentExpandable" },
      ],
    },
  },

  "comm-eva-article": {
    conditions: { video: false, comm: true, eva: true, article: true, photo: false },
    layout: {
      left: [
        { type: "eva", styleClass: "componentNaturalSize" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "comm-eva-photo": {
    conditions: { video: false, comm: true, eva: true, article: false, photo: true },
    layout: {
      left: [
        { type: "eva-long", styleClass: "componentExpandable" },
        { type: "globe", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "comm-eva": {
    conditions: { video: false, comm: true, eva: true, article: false, photo: false },
    layout: {
      left: [{ type: "eva-long", styleClass: "componentExpandable" }],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "comm-article-photo": {
    conditions: { video: false, comm: true, eva: false, article: true, photo: true },
    layout: {
      left: [{ type: "article", styleClass: "componentExpandable" }],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [
        { type: "comm", styleClass: "componentExpandable" },
        { type: "globe", styleClass: "componentExpandable" },
      ],
    },
  },

  "comm-article": {
    conditions: { video: false, comm: true, eva: false, article: true, photo: false },
    layout: {
      left: [{ type: "article", styleClass: "componentExpandable" }],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "comm-photo": {
    conditions: { video: false, comm: true, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "photo-tall", styleClass: "componentNaturalSize" }],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  comm: {
    conditions: { video: false, comm: true, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "flights", styleClass: "componentExpandable" }],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget-rest", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },
};
