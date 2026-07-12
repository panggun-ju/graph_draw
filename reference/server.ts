import express from "express";
import path from "path";
import multer from "multer";
import potrace from "potrace";
import Jimp from "jimp";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use memory storage for multer
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json());

  // API Route for vectorizing an image
  app.post("/api/vectorize", upload.single("image"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No image provided" });
      return;
    }

    try {
      const threshold = parseInt(req.body.threshold) || 128;
      const optTolerance = parseFloat(req.body.optTolerance) || 0.2;
      const turnPolicy = req.body.turnPolicy || "black";

      // Safely load the image using Jimp to avoid crashes with bad data
      const image = await Jimp.read(req.file.buffer);
      // Re-encode as PNG to ensure potrace's older Jimp can parse it
      const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);

      // configure potrace parameters
      const params = {
        threshold: threshold,
        optTolerance: optTolerance,
        optCurve: true,
        turdSize: 2,
        alphaMax: 1,
        turnPolicy: turnPolicy, 
      };

      potrace.trace(pngBuffer, params, (err: any, svg: string) => {
        if (err) {
          console.error("Potrace error:", err);
          res.status(500).json({ error: "Failed to vectorize image" });
          return;
        }
        res.json({ svg });
      });
    } catch (error) {
      console.error("Image processing error:", error);
      res.status(400).json({ error: "Invalid image format or corrupted file." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
