import { MongoClient, ServerApiVersion } from 'mongodb';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios'; // Corrigido: axios importado
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

dotenv.config();
const mongoUri = process.env.MONGO_URI;
let db;

async function connectDB() {
  if (db) return db;
  if (!mongoUri) {
    console.error('MONGO_URI não definida!');
    process.exit(1);
  }
  const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  await client.connect();
  db = client.db("ifcodeLogsDB");
  console.log("Conectado ao MongoDB Atlas!");
  return db;
}

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =================================================================
// ROTA GET HISTÓRICOS
// =================================================================
app.get('/api/chat/historicos', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Conexão com o banco de dados não estabelecida." });

    const collection = db.collection("sessoesChat");
    const historicos = await collection.find({})
                                      .sort({ startTime: -1 })
                                      .limit(20)
                                      .toArray();
    res.json(historicos);
  } catch (error) {
    console.error("[Servidor] Erro ao buscar históricos:", error);
    res.status(500).json({ error: "Erro interno ao buscar históricos de chat." });
  }
});

// =================================================================
// GOOGLE GEMINI SETUP
// =================================================================
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("A variável de ambiente GEMINI_API_KEY não está definida.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

function getCurrentTime() {
  console.log("FUNÇÃO LOCAL: getCurrentTime() foi chamada.");
  const now = new Date();
  return { currentTime: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) };
}

app.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "A mensagem é obrigatória." });

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: {
        parts: [
          { text: `
            Você é o EstiloBot, um personal stylist que entende tudo sobre moda, tendências e novas coleções.
            Sempre responda de forma educada, clara e em português do Brasil.
            Seja simpático e objetivo.
          ` }
        ]
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    });

    const chatHistory = history?.map(h => ({
      role: h.author === 'model' ? 'model' : 'user',
      parts: [{ text: h.content }]
    })) || [];

    const chat = model.startChat({ history: chatHistory });
    console.log("Enviando mensagem para o Gemini:", message);

    const result = await chat.sendMessage(message);
    const text = result.response.text();
    console.log("Resposta do Gemini:", text);

    res.json({ response: text });
  } catch (error) {
    console.error("Erro no endpoint /chat:", error);
    if (error.message?.includes("API key not valid")) {
      res.status(401).json({ error: "Chave de API do Gemini inválida." });
    } else if (error.message?.toUpperCase().includes("SAFETY")) {
      res.status(400).json({ error: "Resposta bloqueada por segurança." });
    } else {
      res.status(500).json({ error: "Erro interno no servidor.", details: error.message });
    }
  }
});

// =================================================================
// USER INFO E LOG
// =================================================================
app.get('/api/user-info', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress;
    if (!ip) return res.status(400).json({ error: "IP não identificado" });

    const geoResponse = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,city,query`);
    const data = geoResponse.data;

    if (data.status === 'success') {
      return res.json({ ip: data.query, city: data.city, country: data.country });
    } else {
      return res.status(500).json({ error: data.message || "Geolocalização falhou" });
    }
  } catch (err) {
    console.error("Erro /api/user-info:", err);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.post('/api/log-connection', async (req, res) => {
  await connectDB();
  const { ip, city, timestamp } = req.body;

  if (!ip || !city || !timestamp) {
    return res.status(400).json({ error: "Dados incompletos (ip, city, timestamp exigidos)" });
  }

  try {
    const logEntry = { ipAddress: ip, city, connectionTime: new Date(timestamp), createdAt: new Date() };
    const collection = db.collection("accessLogs");
    const result = await collection.insertOne(logEntry);
    console.log("Log inserido:", result.insertedId);
    res.status(201).json({ message: "Log salvo", logId: result.insertedId });
  } catch (err) {
    console.error("Erro /api/log-connection:", err);
    res.status(500).json({ error: "Erro ao salvar log" });
  }
});

// =================================================================
// SALVAR HISTÓRICO DO CHAT
// =================================================================
app.post('/api/chat/salvar', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Conexão com o banco de dados não estabelecida." });

    const collection = db.collection("sessoesChat");
    const novoHistorico = {
      userMessage: req.body.userMessage,
      botMessage: req.body.botMessage,
      startTime: new Date(),
    };

    await collection.insertOne(novoHistorico);
    res.json({ success: true, historico: novoHistorico });
  } catch (err) {
    console.error("Erro ao salvar histórico:", err);
    res.status(500).json({ error: "Erro ao salvar histórico." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
