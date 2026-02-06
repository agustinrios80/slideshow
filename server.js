const cron = require("node-cron");
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;

dotenv.config();

// Debug de variables de entorno
console.log("Cloudinary:", {
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY ? "OK" : "NO",
  secret: process.env.CLOUDINARY_API_SECRET ? "OK" : "NO"
});

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const upload = multer({ dest: "uploads/" });

// IP local (solo para QR en local)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let iface in interfaces) {
    for (let alias of interfaces[iface]) {
      if (alias.family === "IPv4" && !alias.internal) {
        return alias.address;
      }
    }
  }
  return "localhost";
}

const localIP = getLocalIP();
const PORT = process.env.PORT || 3000;

// Archivos estáticos
app.use(express.static(__dirname));

// Home → upload
app.get("/", (req, res) => {
  res.redirect("/upload");
});

// Página de subida
app.get("/upload", (req, res) => {
  res.sendFile(path.join(__dirname, "upload.html"));
});

// Subida de imagen + Cloudinary (CARPETA slideshow)
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No se recibió ninguna imagen.");
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "slideshow"
    });

    fs.unlinkSync(req.file.path);

    console.log("Imagen subida:", result.secure_url);

    res.redirect(`/slideshow?img=${encodeURIComponent(result.secure_url)}`);
  } catch (err) {
    console.error("Error subiendo a Cloudinary:", err);
    res.status(500).send("❌ Error al subir la imagen.");
  }
});

// Página de proyección
app.get("/slideshow", (req, res) => {
  const imageUrl = req.query.img;

  if (!imageUrl) {
    return res.redirect("/upload");
  }

  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Imagen subida</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #111;
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family: Arial, sans-serif;
      }
      .card {
        background: #1e1e1e;
        padding: 30px;
        border-radius: 12px;
        text-align: center;
        width: 320px;
        box-shadow: 0 0 20px rgba(0,0,0,0.5);
      }
      img {
        width: 100%;
        border-radius: 10px;
        margin-bottom: 15px;
      }
      a {
        display: block;
        margin-top: 10px;
        padding: 10px;
        background: #4caf50;
        color: white;
        text-decoration: none;
        border-radius: 6px;
      }
      a:hover {
        background: #45a049;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>🎉 ¡Foto subida!</h2>
      <img src="${imageUrl}">
      <a href="${imageUrl}" target="_blank">Ver imagen en grande</a>
      <a href="/gallery">Ver galería</a>
    </div>
  </body>
  </html>
  `);
});

// Galería (SIN DUPLICADOS)
app.get("/gallery", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:slideshow AND resource_type:image")
      .sort_by("created_at", "desc")
      .max_results(30)
      .execute();

    const images = [
      ...new Set(result.resources.map(img => img.secure_url))
    ];

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Galería</title>
        <style>
          body {
            background: #111;
            color: white;
            font-family: Arial;
            padding: 20px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
          }
          img {
            width: 100%;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,.5);
          }
          a {
            color: #4caf50;
          }
        </style>
      </head>
      <body>
        <h1>📸 Galería</h1>
        <a href="/upload">Subir otra imagen</a>
        <div class="grid">
          ${images.map(url => `<img src="${url}">`).join("")}
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.send("Error cargando galería");
  }
});

// CRON: borrar imágenes viejas (5 minutos)
cron.schedule("0 * * * *", async () => {
  console.log("🧹 Limpiando imágenes viejas...");

  try {
    const limite = new Date(Date.now() - 5 * 60 * 1000);

    const result = await cloudinary.search
      .expression("folder:slideshow AND resource_type:image")
      .sort_by("created_at", "asc")
      .max_results(100)
      .execute();

    for (const img of result.resources) {
      if (new Date(img.created_at) < limite) {
        await cloudinary.uploader.destroy(img.public_id);
        console.log("🗑️ Borrada:", img.public_id);
      }
    }
  } catch (err) {
    console.error("Error limpiando imágenes:", err);
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log("Servidor corriendo");

  if (process.env.PORT) {
    console.log("- Producción (Render)");
    console.log("- Upload: /upload");
    console.log("- Gallery: /gallery");
  } else {
    const uploadURL = `http://${localIP}:${PORT}/upload`;
    console.log("- Subida:", uploadURL);
    console.log("- Galería:", `http://${localIP}:${PORT}/gallery`);

    QRCode.toString(uploadURL, { type: "terminal" }, (err, url) => {
      if (!err) console.log(url);
    });
  }
});

