import { Router, type IRouter } from "express";
import healthRouter from "./health";
import lecturerRouter from "./lecturer/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(lecturerRouter);

export default router;
