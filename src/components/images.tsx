import { FunctionComponent } from "react";
import styles from "./images.module.css";

const Images: FunctionComponent<{
  imageItems: ImageItem[];
}> = ({ imageItems }) => {
  const imageBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL;

  return (
    <div className={styles.images}>
      {imageItems.map((item, index) => (
        <div key={index} className={styles.imageItem}>
          <div className={styles.dateTaken}>{item.dateTaken}</div>
          <img src={`${imageBaseUrl}/${item.smallUrl}`} alt={item.ID} width={200} />
        </div>
      ))}
    </div>
  );
};

export default Images;
