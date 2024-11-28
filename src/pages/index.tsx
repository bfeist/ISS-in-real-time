import styles from "./index.module.css";
import { Link, useLoaderData } from "react-router-dom";

const Home = (): JSX.Element => {
  const dates = useLoaderData() as string[];

  return (
    <div className={styles.page}>
      <h1>Available Dates</h1>
      <ul>
        {dates.map((date) => (
          <li key={date}>
            <Link to={`/date/${date}`}>{date}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Home;
