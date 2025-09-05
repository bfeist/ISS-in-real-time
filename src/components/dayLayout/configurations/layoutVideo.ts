// Layouts for when video data is available (rows 1-16 from CSV)
export const videoLayouts: Record<string, LayoutConfiguration> = {
  "video-comm-eva-article-photo": {
    conditions: { video: true, comm: true, eva: true, article: true, photo: true },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
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

  "video-comm-eva-article": {
    conditions: { video: true, comm: true, eva: true, article: true, photo: false },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
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

  "video-comm-eva-photo": {
    conditions: { video: true, comm: true, eva: true, article: false, photo: true },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "eva-long", styleClass: "componentExpandable" },
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

  "video-comm-eva": {
    conditions: { video: true, comm: true, eva: true, article: false, photo: false },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "eva-long", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "video-comm-article-photo": {
    conditions: { video: true, comm: true, eva: false, article: true, photo: true },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
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

  "video-comm-article": {
    conditions: { video: true, comm: true, eva: false, article: true, photo: false },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "video-comm-photo": {
    conditions: { video: true, comm: true, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "video", styleClass: "componentExpandable" }],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "video-comm": {
    conditions: { video: true, comm: true, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "video", styleClass: "componentExpandable" }],
      center: [
        { type: "globe", styleClass: "componentExpandable" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "comm", styleClass: "componentExpandable" }],
    },
  },

  "video-eva-article-photo": {
    conditions: { video: true, comm: false, eva: true, article: true, photo: true },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "eva", styleClass: "componentNaturalSize" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "video-eva-article": {
    conditions: { video: true, comm: false, eva: true, article: true, photo: false },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "eva", styleClass: "componentExpandable" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [{ type: "widget-tall", styleClass: "componentExpandable" }],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "video-eva-photo": {
    conditions: { video: true, comm: false, eva: true, article: false, photo: true },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "eva-long", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "video-eva": {
    conditions: { video: true, comm: false, eva: true, article: false, photo: false },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "eva-long", styleClass: "componentExpandable" },
      ],
      center: [{ type: "widget-tall", styleClass: "componentExpandable" }],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "video-article-photo": {
    conditions: { video: true, comm: false, eva: false, article: true, photo: true },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "video-article": {
    conditions: { video: true, comm: false, eva: false, article: true, photo: false },
    layout: {
      left: [
        { type: "video", styleClass: "componentExpandable" },
        { type: "article", styleClass: "componentExpandable" },
      ],
      center: [{ type: "widget-tall", styleClass: "componentExpandable" }],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  "video-photo": {
    conditions: { video: true, comm: false, eva: false, article: false, photo: true },
    layout: {
      left: [{ type: "video", styleClass: "componentExpandable" }],
      center: [
        { type: "photo", styleClass: "componentNaturalSize" },
        { type: "widget", styleClass: "componentExpandable" },
      ],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },

  video: {
    conditions: { video: true, comm: false, eva: false, article: false, photo: false },
    layout: {
      left: [{ type: "video", styleClass: "componentExpandable" }],
      center: [{ type: "widget-tall", styleClass: "componentExpandable" }],
      right: [{ type: "globe", styleClass: "componentExpandable" }],
    },
  },
};
