import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(currentDir, "../public");
const frontendIndex = path.join(frontendDir, "index.html");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: IncomingMessage) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the editable Lecturer web interface from the same deployment. Static
// assets are handled first; unknown non-API GET routes fall back to index.html
// so client-side routes such as /jobs/:id continue to work.
app.use(express.static(frontendDir));
app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api") &&
    req.accepts("html")
  ) {
    res.sendFile(frontendIndex, (error) => {
      if (error) next(error);
    });
    return;
  }

  next();
});

export default app;
