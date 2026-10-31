import { loadDotEnv } from "../src/config/load-dotenv";
import { writeReports } from "../src/bench/report";

loadDotEnv();
const ids = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const paths = writeReports(ids);
console.log(JSON.stringify(paths));
