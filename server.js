// =================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// =================================================================
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';
import mongoose from 'mongoose';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Novos imports para a área administrativanpm s
import SystemInstruction from './systemInstruction.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Variáveis de ambiente
const mongoUri = process.env.MONGO_URI;
const apiKey = process.env.GEMINI_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// =================================================================
// 2. CONEXÃO COM O BANCO DE DADOS (usando Mongoose)
// =================================================================
async function connectDB() {
    try {
        if (!mongoUri) {
            console.error('MONGO_URI não definida!');
            process.exit(1);
        }
        await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("Conectado ao MongoDB Atlas!");
    } catch (error) {
        console.error("Erro ao conectar com o banco de dados:", error);
        process.exit(1);
    }
}
connectDB();

// =================================================================
// 3. MIDDELWARE DE SEGURANÇA (para rotas de admin)
// =================================================================
const verifyAdminPassword = (req, res, next) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Acesso negado. Senha de administrador incorreta.' });
    }
    next();
};

// =================================================================
// 4. ROTAS DE ADMINISTRAÇÃO (NOVAS)
// =================================================================
app.post('/api/admin/stats', verifyAdminPassword, async (req, res) => {
    try {
        const totalConversations = await mongoose.connection.collection('sessoesChat').countDocuments({});
        const totalMessages = await mongoose.connection.collection('messages').countDocuments({});
        const recentConversations = await mongoose.connection.collection('sessoesChat')
            .find({})
            .sort({ startTime: -1 })
            .limit(5)
            .toArray();

        res.json({
            totalConversations,
            totalMessages: "Função não implementada", // Adapte se você tiver uma coleção de mensagens
            recentConversations,
        });
    } catch (error) {
        console.error('Erro ao obter métricas do admin:', error);
        res.status(500).json({ error: 'Erro ao processar a solicitação.' });
    }
});

app.post('/api/admin/system-instruction', verifyAdminPassword, async (req, res) => {
    try {
        const instruction = await SystemInstruction.findOne({});
        res.json({ text: instruction ? instruction.text : '' });
    } catch (error) {
        console.error('Erro ao obter instrução do sistema:', error);
        res.status(500).json({ error: 'Erro ao processar a solicitação.' });
    }
});

app.post('/api/admin/update-system-instruction', verifyAdminPassword, async (req, res) => {
    try {
        const { text } = req.body;
        await SystemInstruction.findOneAndUpdate({}, { text }, { upsert: true, new: true });
        res.status(200).json({ message: 'Instrução do sistema atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar instrução do sistema:', error);
        res.status(500).json({ error: 'Erro ao processar a solicitação.' });
    }
});

// =================================================================
// 5. ROTAS EXISTENTES (ALGUMAS ADAPTADAS)
// =================================================================
const genAI = new GoogleGenerativeAI(apiKey);

// Rota GET HISTÓRICOS
app.get('/api/chat/historicos', async (req, res) => {
    try {
        const collection = mongoose.connection.collection("sessoesChat");
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

// Rota principal do chat
app.post('/chat', async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message) return res.status(400).json({ error: "A mensagem é obrigatória." });

        // Nova lógica: Buscar a instrução de sistema do banco de dados
        const instructionDoc = await SystemInstruction.findOne({});
        const systemInstructionText = instructionDoc ? instructionDoc.text : 'Você é o EstiloBot, um personal stylist que entende tudo sobre moda, tendências e novas coleções.';

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            // Use a instrução de sistema que veio do banco de dados
            systemInstruction: {
                parts: [{ text: systemInstructionText }]
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

// Rota SALVAR HISTÓRICO DO CHAT
app.post('/api/chat/salvar', async (req, res) => {
    try {
        const collection = mongoose.connection.collection("sessoesChat");
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

// Rota USER INFO e LOG (mantida como original, mas pode ser adaptada para Mongoose)
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
    try {
        const { ip, city, timestamp } = req.body;
        if (!ip || !city || !timestamp) {
            return res.status(400).json({ error: "Dados incompletos (ip, city, timestamp exigidos)" });
        }

        const logEntry = { ipAddress: ip, city, connectionTime: new Date(timestamp), createdAt: new Date() };
        const collection = mongoose.connection.collection("accessLogs");
        const result = await collection.insertOne(logEntry);
        console.log("Log inserido:", result.insertedId);
        res.status(201).json({ message: "Log salvo", logId: result.insertedId });
    } catch (err) {
        console.error("Erro /api/log-connection:", err);
        res.status(500).json({ error: "Erro ao salvar log" });
    }
});

// =================================================================
// 6. INICIALIZAÇÃO DO SERVIDOR
// =================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em https://chatbott-4bv4.onrender.com/`));