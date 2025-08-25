const chatBox = document.getElementById('chat-box');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');

let history = [];

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userMessage = input.value;
  appendMessage('Você', userMessage);
  input.value = '';

  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage, history: history })
  });

  const data = await response.json();
  appendMessage('Bot', data.response);
  history = data.history;
});

function appendMessage(sender, text) {
  const div = document.createElement('div');
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
app.get('/api/user-info', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',').shift()
      || req.socket.remoteAddress;
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
    const logEntry = {
      ipAddress: ip,
      city,
      connectionTime: new Date(timestamp),
      createdAt: new Date(),
    };
    const collection = db.collection("accessLogs");
    const result = await collection.insertOne(logEntry);
    console.log("Log inserido:", result.insertedId);
    res.status(201).json({ message: "Log salvo", logId: result.insertedId });
  } catch (err) {
    console.error("Erro /api/log-connection:", err);
    res.status(500).json({ error: "Erro ao salvar log" });
  }
});
async function registrarConexaoUsuario() {
  try {
    const res1 = await fetch(`${backendUrl}/api/user-info`);
    if (!res1.ok) throw new Error(await res1.text());
    const userInfo = await res1.json();

    const logData = {
      ip: userInfo.ip,
      city: userInfo.city,
      timestamp: new Date().toISOString(),
    };

    const res2 = await fetch(`${backendUrl}/api/log-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logData),
    });
    if (!res2.ok) throw new Error(await res2.text());
    console.log("Log enviado com sucesso!");
  } catch (err) {
    console.error("Falha ao registrar conexão:", err);
  }
}

window.addEventListener('load', registrarConexaoUsuario);

// Este listener garante que o histórico seja carregado assim que a página abre.
document.addEventListener('DOMContentLoaded', () => {
    carregarHistoricoSessoes();
});

/**
 * Busca os históricos da API do backend e preenche a lista no HTML.
 */
async function carregarHistoricoSessoes() {
    const listaSessoesEl = document.getElementById('lista-sessoes');
    // IMPORTANTE: Esta deve ser a URL do seu backend.
    const backendUrl = 'http://localhost:3000/api/chat/historicos'; 

    try {
        const response = await fetch(backendUrl);
        if (!response.ok) {
            throw new Error('A resposta da rede não foi bem-sucedida.');
        }
        const sessoes = await response.json();

        listaSessoesEl.innerHTML = ''; // Limpa a lista antes de adicionar os itens

        if (sessoes.length === 0) {
            listaSessoesEl.innerHTML = '<li>Nenhum histórico de conversa encontrado.</li>';
            return;
        }

        sessoes.forEach(sessao => {
            const li = document.createElement('li');
            // Formata a data para ficar mais legível
            const dataFormatada = new Date(sessao.startTime).toLocaleString('pt-BR');
            
            li.textContent = `Conversa de ${dataFormatada}`;
            li.style.cursor = 'pointer'; // Mostra que o item é clicável
            li.title = 'Clique para ver os detalhes';

            // Adiciona o evento de clique para mostrar a conversa detalhada
            li.addEventListener('click', () => {
                exibirConversaDetalhada(sessao.messages);
            });

            listaSessoesEl.appendChild(li);
        });

    } catch (error) {
        console.error('Falha ao carregar o histórico de conversas:', error);
        listaSessoesEl.innerHTML = '<li>Erro ao carregar o histórico. Verifique o console para mais detalhes.</li>';
    }
}

/**
 * Exibe as mensagens de uma sessão específica na área de detalhes.
 * @param {Array} mensagens - O array de mensagens da conversa.
 */
function exibirConversaDetalhada(mensagens) {
    const detalheContainerEl = document.getElementById('visualizacao-conversa-detalhada');
    detalheContainerEl.innerHTML = ''; // Limpa a visualização anterior

    if (!mensagens || mensagens.length === 0) {
        detalheContainerEl.innerHTML = '<p>Esta sessão não possui mensagens.</p>';
        return;
    }

    mensagens.forEach(msg => {
        const p = document.createElement('p');
        
        // IMPORTANTE: Verifique no seu CSS se os nomes das classes estão corretos!
        // Se você usa nomes diferentes para estilizar as mensagens, troque aqui.
        if (msg.author === 'user') {
            p.className = 'mensagem-usuario'; // Ex: <p class="mensagem-usuario">Olá</p>
            p.textContent = `Você: ${msg.content}`;
        } else {
            p.className = 'mensagem-bot'; // Ex: <p class="mensagem-bot">Oi, tudo bem?</p>
            p.textContent = `TopizioBot: ${msg.content}`;
        }

        detalheContainerEl.appendChild(p);
    });
}