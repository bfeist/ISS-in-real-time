import { FunctionComponent } from "react";
import styles from "./articles.module.css";
import { useDateActivitySummary, useDateBlogArticles } from "api/useDateSpecificData";
import { useStateClock } from "store/hooks/useStateClock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import SourceButton from "../common/sourceButton";

const Blog: FunctionComponent = () => {
  const { selectedDate } = useStateClock();

  const { data: blogArticles, isLoading: articlesIsLoading } = useDateBlogArticles(selectedDate);
  const { data: activitySummary, isLoading: summaryIsLoading } =
    useDateActivitySummary(selectedDate);

  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const [year, month, day] = selectedDate.split("-");

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
                      variant="withText"
                    >
                      Source <FontAwesomeIcon icon={faExternalLinkAlt} />
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
            <h3 className={styles.sectionTitle}>
              Activity Summary{" "}
              {activitySummary.sourceUrl && (
                <SourceButton
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(activitySummary.sourceUrl, "_blank");
                  }}
                  variant="withText"
                >
                  Source <FontAwesomeIcon icon={faExternalLinkAlt} />
                </SourceButton>
              )}
            </h3>

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
      </div>
    </div>
  );
};

export default Blog;
