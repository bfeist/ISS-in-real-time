import { FunctionComponent, useState } from "react";
import styles from "./articles.module.css";
import {
  useDateActivitySummary,
  useDateBlogArticles,
  useDateTimelineUrl,
} from "api/useDateSpecificData";
import { useStateClock } from "store/hooks/useStateClock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import SourceButton from "../common/sourceButton";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const Blog: FunctionComponent = () => {
  const { selectedDate } = useStateClock();

  const { data: blogArticles, isLoading: articlesIsLoading } = useDateBlogArticles(selectedDate);
  const { data: activitySummary, isLoading: summaryIsLoading } =
    useDateActivitySummary(selectedDate);
  const timelineUrl = useDateTimelineUrl(selectedDate);

  const [numPages, setNumPages] = useState<number | null>(null);

  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const [year, month, day] = selectedDate.split("-");

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  if (articlesIsLoading || summaryIsLoading) {
    return (
      <div className={styles.blogContainer}>
        <div className={styles.scrollableContent}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.blogContainer}>
      <div className={styles.scrollableContent}>
        {blogArticles && blogArticles.length > 0 && (
          <div className={styles.blogEntries}>
            {blogArticles.map((blogArticle, index) => (
              <div key={index} className={styles.blogEntry}>
                <h3>
                  {blogArticle.title}{" "}
                  {blogArticle.source_url && (
                    <SourceButton
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(blogArticle.source_url, "_blank");
                      }}
                      variant="iconOnly"
                    >
                      <FontAwesomeIcon icon={faExternalLinkAlt} />
                    </SourceButton>
                  )}
                </h3>
                <div className={styles.content}>
                  {blogArticle.image_filename && (
                    <div className={styles.imageContainer}>
                      <a
                        href={`${baseStaticUrl}/blog_articles/${year}/${month}/${day}/${blogArticle.image_filename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={`${baseStaticUrl}/blog_articles/${year}/${month}/${day}/${blogArticle.image_filename}`}
                          alt={blogArticle.image_caption || blogArticle.title}
                          className={styles.clickableImage}
                        />
                      </a>
                      {blogArticle.image_caption && (
                        <p className={styles.imageCaption}>{blogArticle.image_caption}</p>
                      )}
                    </div>
                  )}
                  {blogArticle.paragraphs.map((paragraph, i) => (
                    <p key={i} dangerouslySetInnerHTML={{ __html: paragraph }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activitySummary && Object.keys(activitySummary).length > 0 && (
          <div className={styles.activitySummary}>
            <div className={styles.sectionTitle}>
              Activity Summary{" "}
              {activitySummary.sourceUrl && (
                <SourceButton
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(activitySummary.sourceUrl, "_blank");
                  }}
                  variant="iconOnly"
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                </SourceButton>
              )}
            </div>

            {activitySummary.general && activitySummary.general.length > 0 && (
              <div className={styles.activityCategory}>
                <h3>General</h3>
                <ul className={styles.activityList}>
                  {activitySummary.general.map((activity, index) => (
                    <li key={index} className={styles.activityItem}>
                      <span className={styles.activityName}>{activity.name}</span>
                      {activity.description && <span>: {activity.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activitySummary.tasklist && activitySummary.tasklist.length > 0 && (
              <div className={styles.activityCategory}>
                <h3>Task List</h3>
                <ul className={styles.activityList}>
                  {activitySummary.tasklist.map((activity, index) => (
                    <li key={index} className={styles.activityItem}>
                      <span>{activity.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activitySummary.ground && activitySummary.ground.length > 0 && (
              <div className={styles.activityCategory}>
                <h3>Ground Activities</h3>
                <ul className={styles.activityList}>
                  {activitySummary.ground.map((activity, index) => (
                    <li key={index} className={styles.activityItem}>
                      <span>{activity.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {timelineUrl && (
          <div className={styles.timelineSection}>
            <div className={styles.sectionTitle}>
              Station Timeline <FontAwesomeIcon icon={faFilePdf} />
              <SourceButton
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(timelineUrl, "_blank");
                }}
                variant="iconOnly"
                tooltip="Open station timeline PDF"
              >
                <FontAwesomeIcon icon={faExternalLinkAlt} />
              </SourceButton>
            </div>
            <div className={styles.pdfContainer}>
              <div className={styles.pdfDarkMode}>
                <Document
                  file={timelineUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={<div className={styles.pdfLoading}>Loading station timeline PDF...</div>}
                  error={<div className={styles.pdfError}>Failed to load timeline PDF.</div>}
                >
                  {Array.from(new Array(numPages), (_, index) => (
                    <Page
                      key={`page_${index + 1}`}
                      pageNumber={index + 1}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className={styles.pdfPage}
                      width={850}
                    />
                  ))}
                </Document>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Blog;
