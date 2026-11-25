import "dotenv/config";
import { buildCityTiles } from "./city-tiles-builder";

buildCityTiles(process.argv.slice(2)).catch((error: unknown) => {
  console.error("Could not build city catalogs:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
