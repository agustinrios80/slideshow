const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;

dotenv.config();

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const upload = multer({ dest: "uploads/" });

// Función para obtener IP local
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
const PORT = 3000;

// Archivos estáticos
app.use(express.static(__dirname));

// Página de subida
app.get("/upload", (req, res) => {
  res.sendFile(path.join(__dirname, "upload.html"));
});

// Procesar subida + Cloudinary
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path);

    // borrar archivo local
    fs.unlinkSync(req.file.path);

    // redirigir al slideshow con parámetro URL
    res.redirect(`/slideshow?img=${encodeURIComponent(result.secure_url)}`);

  } catch (err) {
    console.error("Error subiendo a Cloudinary:", err);
    res.status(500).send("❌ Error al subir la imagen.");
  }
});

// Página de proyección dinámica
app.get("/slideshow", (req, res) => {
  const imageUrl = req.query.img;

  if (!imageUrl) {
    return res.send("No hay imagen para mostrar.");
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
        width: 300px;
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
      <img src="${imageUrl}" alt="Vista previa">
      <a href="${imageUrl}" target="_blank">Ver imagen en grande</a>
      <a href="/upload">Subir otra foto</a>
    </div>
  </body>
  </html>
  `);
});

// API para obtener imagenes de Cloudinary (carpeta root)
app.get("/images", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:uploads OR *")
      .sort_by("created_at", "desc")
      .max_results(30)
      .execute();

    const urls = result.resources.map(img => img.secure_url);

    res.json(urls);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

// Iniciar servidor y mostrar QR
app.listen(PORT, async () => {
  const uploadURL = `http://${localIP}:${PORT}/upload`;
  console.log(`Servidor corriendo en:`);
  console.log(`- Subida: ${uploadURL}`);
  console.log(`- Proyección: http://localhost:${PORT}/slideshow`);

  // Generar QR en consola
  QRCode.toString(uploadURL, { type: "terminal" }, (err, url) => {
    if (!err) console.log(url);
  });
});
