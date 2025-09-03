// Layouts for when comm data is available but no video (rows 17-24 from CSV)
export const commLayouts: Record<string, LayoutConfiguration> = {
  "comm-eva-article-photo": {
    conditions: { video: false, comm: true, eva: true, article: true, photo: true },
    layout: {
      left: [{ type: "eva-article" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "comm" }, { type: "globe" }],
    },
  },

  "comm-eva-article": {
    conditions: { video: false, comm: true, eva: true, article: true, photo: false },
    layout: {
      left: [{ type: "eva-article" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "comm-eva-photo": {
    conditions: { video: false, comm: true, eva: true, article: false, photo: true },
    layout: {
      left: [{ type: "eva-long" }, { type: "globe" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "comm-eva": {
    conditions: { video: false, comm: true, eva: true, article: false, photo: false },
    layout: {
      left: [{ type: "eva-long" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "comm-article-photo": {
    conditions: { video: false, comm: true, eva: false, article: true, photo: true },
    layout: {
      left: [{ type: "article" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "comm" }, { type: "globe" }],
    },
  },

  "comm-article": {
    conditions: { video: false, comm: true, eva: false, article: true, photo: false },
    layout: {
      left: [{ type: "article" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "comm-photo": {
    conditions: { video: false, comm: true, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "photo" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  comm: {
    conditions: { video: false, comm: true, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "flights" }],
      center: [{ type: "globe-widget-rest" }],
      right: [{ type: "comm" }],
    },
  },
};
