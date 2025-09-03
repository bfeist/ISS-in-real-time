// Layouts for when video data is available (rows 1-16 from CSV)
export const videoLayouts: Record<string, LayoutConfiguration> = {
  "video-comm-eva-article-photo": {
    conditions: { video: true, comm: true, eva: true, article: true, photo: true },
    layout: {
      left: [{ type: "video-eva-article" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "comm" }, { type: "globe" }],
    },
  },

  "video-comm-eva-article": {
    conditions: { video: true, comm: true, eva: true, article: true, photo: false },
    layout: {
      left: [{ type: "video-eva-article" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "video-comm-eva-photo": {
    conditions: { video: true, comm: true, eva: true, article: false, photo: true },
    layout: {
      left: [{ type: "video-eva-long" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "comm" }, { type: "globe" }],
    },
  },

  "video-comm-eva": {
    conditions: { video: true, comm: true, eva: true, article: false, photo: false },
    layout: {
      left: [{ type: "video-eva-long" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "video-comm-article-photo": {
    conditions: { video: true, comm: true, eva: false, article: true, photo: true },
    layout: {
      left: [{ type: "video-article" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "comm" }, { type: "globe" }],
    },
  },

  "video-comm-article": {
    conditions: { video: true, comm: true, eva: false, article: true, photo: false },
    layout: {
      left: [{ type: "video-article" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "video-comm-photo": {
    conditions: { video: true, comm: true, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "video" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "video-comm": {
    conditions: { video: true, comm: true, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "video" }],
      center: [{ type: "globe-widget" }],
      right: [{ type: "comm" }],
    },
  },

  "video-eva-article-photo": {
    conditions: { video: true, comm: false, eva: true, article: true, photo: true },
    layout: {
      left: [{ type: "video-eva-article" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "globe" }],
    },
  },

  "video-eva-article": {
    conditions: { video: true, comm: false, eva: true, article: true, photo: false },
    layout: {
      left: [{ type: "video-eva-article" }],
      center: [{ type: "widget-tall" }],
      right: [{ type: "globe" }],
    },
  },

  "video-eva-photo": {
    conditions: { video: true, comm: false, eva: true, article: false, photo: true },
    layout: {
      left: [{ type: "video-eva-long" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "globe" }],
    },
  },

  "video-eva": {
    conditions: { video: true, comm: false, eva: true, article: false, photo: false },
    layout: {
      left: [{ type: "video-eva-long" }],
      center: [{ type: "widget-tall" }],
      right: [{ type: "globe" }],
    },
  },

  "video-article-photo": {
    conditions: { video: true, comm: false, eva: false, article: true, photo: true },
    layout: {
      left: [{ type: "video-article" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "globe" }],
    },
  },

  "video-article": {
    conditions: { video: true, comm: false, eva: false, article: true, photo: false },
    layout: {
      left: [{ type: "video-article" }],
      center: [{ type: "widget-tall" }],
      right: [{ type: "globe" }],
    },
  },

  "video-photo": {
    conditions: { video: true, comm: false, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "video" }],
      center: [{ type: "photo-widget" }],
      right: [{ type: "globe" }],
    },
  },

  video: {
    conditions: { video: true, comm: false, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "video" }],
      center: [{ type: "widget-tall" }],
      right: [{ type: "globe" }],
    },
  },
};
