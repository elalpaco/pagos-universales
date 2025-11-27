import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;

// CORS: permitir peticiones desde frontend local
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
  })
);

app.use(express.json());

// Ruta básica
app.get("/", (req, res) => {
  res.json({
    message: "PAGOS-UNIVERSALES backend funcionando 🚀",
  });
});

// Health check con base de datos
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const usersCount = await prisma.user.count();

    res.json({
      status: "ok",
      db: "connected",
      usersCount,
    });
  } catch (error) {
    console.error("Error en /health:", error);
    res.status(500).json({
      status: "error",
      db: "failed",
      message: "No se pudo conectar a la base de datos",
    });
  }
});

// Crear usuario
app.post("/users", async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email es obligatorio" });
    }

    const user = await prisma.user.create({
      data: { email, name },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error("Error en POST /users:", error);
    res.status(500).json({ error: "Error creando usuario" });
  }
});

// Listar usuarios
app.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: "desc" },
    });
    res.json(users);
  } catch (error) {
    console.error("Error en GET /users:", error);
    res.status(500).json({ error: "Error listando usuarios" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
