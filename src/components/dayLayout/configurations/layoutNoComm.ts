// Layouts for when neither video nor comm data is available (rows 25-32 from CSV)
export const noCommLayouts: Record<string, LayoutConfiguration> = {
  "eva-article-photo": {
    conditions: { video: false, comm: false, eva: true, article: true, photo: true },
    layout: {
      left: [{ type: "photo-article" }],
      center: [{ type: "eva-long" }, { type: "widget" }],
      right: [{ type: "globe" }],
    },
  },

  "eva-article": {
    conditions: { video: false, comm: false, eva: true, article: true, photo: false },
    layout: {
      left: [{ type: "article" }],
      center: [{ type: "eva-long" }, { type: "widget" }],
      right: [{ type: "globe" }],
    },
  },

  "eva-photo": {
    conditions: { video: false, comm: false, eva: true, article: false, photo: true },
    layout: {
      left: [{ type: "photo-eva-long" }],
      center: [{ type: "widget-tall" }],
      right: [{ type: "globe" }],
    },
  },

  eva: {
    conditions: { video: false, comm: false, eva: true, article: false, photo: false },
    layout: {
      left: [{ type: "flights" }],
      center: [{ type: "eva" }, { type: "widget-rest" }],
      right: [{ type: "globe" }],
    },
  },

  "article-photo": {
    conditions: { video: false, comm: false, eva: false, article: true, photo: true },
    layout: {
      left: [{ type: "article" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "globe" }],
    },
  },

  article: {
    conditions: { video: false, comm: false, eva: false, article: true, photo: false },
    layout: {
      left: [{ type: "article" }],
      center: [{ type: "widget-tall" }],
      right: [{ type: "globe" }],
    },
  },

  photo: {
    conditions: { video: false, comm: false, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "photo" }],
      center: [{ type: "globe-widget-rest" }],
      right: [{ type: "flights" }],
    },
  },

  // Default fallback when no data is available
  none: {
    conditions: { video: false, comm: false, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "flights" }],
      center: [{ type: "widget-tall" }],
      right: [{ type: "globe" }],
    },
  },
};
