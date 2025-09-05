// Layouts for when neither video nor comm data is available (rows 25-32 from CSV)
export const noCommLayouts: Record<string, LayoutConfiguration> = {
  "eva-article-photo": {
    conditions: { video: false, comm: false, eva: true, article: true, photo: true },
    layout: {
      left: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "eva-long", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "eva-article": {
    conditions: { video: false, comm: false, eva: true, article: true, photo: false },
    layout: {
      left: [{ type: "article", styleClass: "componentExpandable" }],
      center: [
        { type: "eva-long", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "eva-photo": {
    conditions: { video: false, comm: false, eva: true, article: false, photo: true },
    layout: {
      left: [{ type: "photo-tall", styleClass: "componentExpandable" }, ,],
      center: [
        { type: "eva-long", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  eva: {
    conditions: { video: false, comm: false, eva: true, article: false, photo: false },
    layout: {
      left: [{ type: "flights", styleClass: "componentExpandable" }],
      center: [
        { type: "eva", styleClass: "componentExpandable" },
        { type: "widget-rest", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "article-photo": {
    conditions: { video: false, comm: false, eva: false, article: true, photo: true },
    layout: {
      left: [{ type: "article", styleClass: "componentExpandable" }],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  article: {
    conditions: { video: false, comm: false, eva: false, article: true, photo: false },
    layout: {
      left: [{ type: "article", styleClass: "componentExpandable" }],
      center: [{ type: "widget-tall", styleClass: "componentExpandable" }],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  photo: {
    conditions: { video: false, comm: false, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "photo-tall", styleClass: "componentExpandable" }],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget-rest", styleClass: "componentExpandable" },
      ],
      right: [{ type: "flights", styleClass: "componentExpandable" }],
    },
  },

  // Default fallback when no data is available
  none: {
    conditions: { video: false, comm: false, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "flights", styleClass: "componentExpandable" }],
      center: [{ type: "widget-rest", styleClass: "componentExpandable" }],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },
};
