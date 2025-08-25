import { MongoClient, ServerApiVersion } from 'mongodb';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
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
  // IMPORTANTE: Seu banco de dados se chama "ifcodeLogsDB".
  db = client.db("ifcodeLogsDB"); 
  console.log("Conectado ao MongoDB Atlas!");
  return db;
}

// Conecta ao iniciar
connectDB();


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =================================================================
//           ADICIONE A NOVA ROTA GET PARA BUSCAR HISTÓRICOS AQUI
// =================================================================
app.get('/api/chat/historicos', async (req, res) => {
  try {
    // 1. Verificação de segurança para garantir que o banco de dados está conectado.
    if (!db) {
      return res.status(500).json({ error: "Conexão com o banco de dados não estabelecida." });
    }

    // 2. Pegue a coleção. Verifique no seu Atlas se o nome é "sessoesChat" ou outro.
    const collection = db.collection("sessoesChat"); 

    // 3. Busque os documentos, ordene pelos mais recentes e limite a 20.
    //    O .toArray() é necessário no driver nativo.
    const historicos = await collection.find({})
                                      .sort({ startTime: -1 }) // -1 para ordem decrescente
                                      .limit(20)
                                      .toArray();
    
    // 4. Envie os dados encontrados como resposta.
    res.json(historicos);

  } catch (error) {
    console.error("[Servidor] Erro ao buscar históricos:", error);
    res.status(500).json({ error: "Erro interno ao buscar históricos de chat." });
  }
});
// =================================================================
//           FIM DA NOVA ROTA
// =================================================================


const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("A variável de ambiente GEMINI_API_KEY não está definida.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// ... O RESTO DO SEU CÓDIGO CONTINUA EXATAMENTE IGUAL ...
// (functions, getCurrentTime, app.post('/chat', ...), etc.)

const functions = [
  {
    name: "getCurrentTime",
    description: "Retorna a data e hora atual no formato pt-BR",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

function getCurrentTime() {
  console.log("FUNÇÃO LOCAL: getCurrentTime() foi chamada.");
  const now = new Date();
  return { currentTime: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) };
}

const availableFunctions = {
  getCurrentTime: getCurrentTime
};

app.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "A mensagem é obrigatória." });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Recomendo usar 1.5-flash que é mais recente
      // functions, // A API do gemini-1.5-flash mudou, 'functions' agora é 'tools'
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    });

    const chatHistory = history ? history.map(h => ({
      role: h.author === 'model' ? 'model' : 'user',
      parts: [{ text: h.content }]
    })) : [];

    const chat = model.startChat({ history: chatHistory });

    console.log("Enviando mensagem para o Gemini:", message);

    const result = await chat.sendMessage(message); // Simplificado para o gemini-1.5-flash

    const geminiResponse = result.response;
    const text = geminiResponse.text();

    console.log("Resposta do Gemini:", text);

    res.json({
      response: text,
    });

  } catch (error) {
    console.error("Erro no endpoint /chat:", error);
    
    if (error.message && error.message.includes("API key not valid")) {
      res.status(401).json({ error: "Chave de API do Gemini inválida ou não configurada corretamente." });
    } else if (error.message && error.message.toUpperCase().includes("SAFETY")) {
      res.status(400).json({ error: "A resposta foi bloqueada devido às configurações de segurança. Tente uma pergunta diferente." });
    } else if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
      res.status(400).json({ error: `A resposta foi bloqueada: ${error.response.promptFeedback.blockReason}` });
    } else {
      res.status(500).json({ error: "Ocorreu um erro interno no servidor.", details: error.message });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));