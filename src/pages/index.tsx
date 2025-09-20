import styles from "./index.module.css";
// import { Link } from "react-router-dom";

const Home = (): JSX.Element => {
  // const availableDateItems = useLoaderData() as AvailableDate[];

  return (
    <div className={`${styles.page} ${styles.home}`}>
      <h1>Coming Soon</h1>
    </div>
  );
};

export default Home;
