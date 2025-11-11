// routes/index.js
import { Router } from "express";

// ==== Routers hiện có (giữ nguyên) ====
import auth from "./auth.js";
import users from "./users.js";
import rooms from "./rooms.js";
import room_collaborators from "./room_collaborators.js";
import images from "./images.js";
import object3d from "./object3d.js";
import textures from "./textures.js";
import collections from "./collections.js";
import collection_items from "./collection_items.js";
import magazines from "./magazines.js";
import magazine_items from "./magazine_items.js";

// ==== Thêm libs cho 2 endpoint gọi Python ====
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import fs from "node:fs";

// Router chính
const r = Router();

// ====== Mount các nhóm route có sẵn ======
r.use("/", auth);
r.use("/user", users);
r.use("/room", rooms);
r.use("/room-collaborator", room_collaborators);
r.use("/media", images);
r.use("/object3d", object3d);
r.use("/texture", textures);
r.use("/collection", collections);
r.use("/collection-item", collection_items);
r.use("/magazine", magazines);
r.use("/magazine-item", magazine_items);

// ====== Debug index: liệt kê nhanh các nhánh ======
r.get("/", (_req, res) => {
  res.json({
    ok: true,
    hint: "Tất cả các đường dẫn dưới đây đều kèm tiền tố /api",
    routes: [
      "/ (bạn đang ở đây)",
      "/health [GET]",
      "/moderate [POST]  (form-data: image)  -> gọi NSFW service",
      "/caption [POST]   (form-data: image[, prompt]) -> gọi BLIP service",
      "/user",
      "/room",
      "/room-collaborator",
      "/media",
      "/object3d",
      "/texture",
      "/collection",
      "/collection-item",
      "/magazine",
      "/magazine-item",
    ],
  });
});

// ====== Upload middleware dùng chung cho 2 endpoint ======
const upload = multer({ dest: "uploads" });

// ====== POST /api/moderate -> forward sang FastAPI NSFW ======
r.post("/moderate", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Missing file 'image'" });

  try {
    const form = new FormData();
    form.append("image", fs.createReadStream(req.file.path), req.file.originalname);

    const NSFW_API_URL = process.env.NSFW_API_URL || "http://localhost:8001/analyze";

    const { data } = await axios.post(NSFW_API_URL, form, {
      headers: form.getHeaders(),
      timeout: 20000,
      maxContentLength: 20 * 1024 * 1024,
      maxBodyLength: 20 * 1024 * 1024,
    });

    // data dự kiến: { ok:true, scores:{...}, top_label:"...", is_nsfw:true/false }
    res.json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ====== POST /api/caption -> forward sang FastAPI BLIP ======
r.post("/caption", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Missing file 'image'" });

  try {
    const form = new FormData();
    form.append("image", fs.createReadStream(req.file.path), req.file.originalname);
    if (req.body?.prompt) form.append("prompt", req.body.prompt);

    const CAPTION_API_URL = process.env.CAPTION_API_URL || "http://localhost:8002/caption";

    const { data } = await axios.post(CAPTION_API_URL, form, {
      headers: form.getHeaders(),
      timeout: 30000,
      maxContentLength: 20 * 1024 * 1024,
      maxBodyLength: 20 * 1024 * 1024,
    });

    // data dự kiến: { caption: "..." } -> trả về thêm ok:true
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

export default r;
