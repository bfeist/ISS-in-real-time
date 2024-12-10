import styles from "./index.module.css";
import { Link, useLoaderData } from "react-router-dom";

const Home = (): JSX.Element => {
  const availableDateItems = useLoaderData() as AvailableDate[];

  return (
    <div className={styles.page}>
      <h1>Available Dates</h1>
      <ul>
        {availableDateItems.map((availableDateItem) => (
          <li key={availableDateItem.date}>
            <Link to={`/date/${availableDateItem.date}`}>{availableDateItem.date}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Home;
