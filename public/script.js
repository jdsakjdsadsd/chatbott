const chatBox = document.getElementById('chat-box');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');

let history = [];

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = input.value;
    appendMessage('', userMessage);
    input.value = '';

    const response = await fetch('http://localhost:3000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: history })
    });

    const data = await response.json();
    appendMessage('', data.response);
    history = data.history;

    // 👉 Salvar no MongoDB
    salvarHistorico(userMessage, data.response);
});

/**
 * Adiciona uma nova mensagem à caixa de chat e aplica o estilo
 * dependendo do remetente.
 */
function appendMessage(sender, text) {
    const chatBox = document.getElementById('chat-box');
    const divMensagem = document.createElement('div');
    
    // Adiciona a classe para estilizar a mensagem (usuario ou bot)
    if (sender === 'user') {
        divMensagem.className = 'mensagem-usuario';
    } else {
        divMensagem.className = 'mensagem-bot';
    }
    
    // Adiciona o texto da mensagem
    divMensagem.innerHTML = `<p>${text}</p>`;

    // Se for uma mensagem do bot, adicione os botões de ação
    if (sender === 'bot') {
        const divAcoes = document.createElement('div');
        divAcoes.className = 'botoes-acao';
        divAcoes.innerHTML = `
            <button class="botao-curtir" title="Curtir a resposta">👍</button>
            <button class="botao-descurtir" title="Descurtir a resposta">👎</button>
            <button class="botao-copiar" title="Copiar a resposta">📄</button>
        `;
        divMensagem.appendChild(divAcoes);

        // Adiciona os event listeners aos botões
        const botoes = divAcoes.querySelectorAll('button');
        botoes.forEach(botao => {
            botao.addEventListener('click', () => {
                const tipo = botao.className.replace('botao-', '');
                lidarComAcao(tipo, text);
            });
        });
    }
    
    chatBox.appendChild(divMensagem);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Nova função para lidar com as ações dos botões
function lidarComAcao(tipo, texto) {
    if (tipo === 'curtir') {
        alert('Você curtiu a resposta!');
        // Aqui você pode enviar uma requisição para o seu backend
        // para registrar o feedback positivo.
    } else if (tipo === 'descurtir') {
        alert('Você descurtiu a resposta.');
        // Aqui você pode enviar uma requisição para o seu backend
        // para registrar o feedback negativo.
    } else if (tipo === 'copiar') {
        navigator.clipboard.writeText(texto).then(() => {
            alert('Mensagem copiada!');
        }).catch(err => {
            console.error('Erro ao copiar a mensagem: ', err);
            alert('Falha ao copiar.');
        });
    }
}
async function carregarHistoricoSessoes() {
    const listaSessoesEl = document.getElementById('lista-sessoes');
    const backendUrl = 'http://localhost:3000/api/chat/historicos';

    try {
        const response = await fetch(backendUrl);
        if (!response.ok) {
            throw new Error('A resposta da rede não foi bem-sucedida.');
        }
        const sessoes = await response.json();

        listaSessoesEl.innerHTML = '';

        if (sessoes.length === 0) {
            listaSessoesEl.innerHTML = '<li>Nenhum histórico de conversa encontrado.</li>';
            return;
        }

        sessoes.forEach(sessao => {
            const li = document.createElement('li');
            const dataFormatada = new Date(sessao.startTime).toLocaleString('pt-BR');
            
            li.textContent = `Conversa de ${dataFormatada}`;
            li.style.cursor = 'pointer';
            li.title = 'Clique para ver os detalhes';

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

function exibirConversaDetalhada(mensagens) {
    const detalheContainerEl = document.getElementById('visualizacao-conversa-detalhada');
    detalheContainerEl.innerHTML = '';

    if (!mensagens || mensagens.length === 0) {
        detalheContainerEl.innerHTML = '<p>Esta sessão não possui mensagens.</p>';
        return;
    }

    mensagens.forEach(msg => {
        const p = document.createElement('p');
        
        if (msg.author === 'user') {
            p.className = 'mensagem-usuario';
            p.textContent = `Você: ${msg.content}`;
        } else {
            p.className = 'mensagem-bot';
            p.textContent = `TopizioBot: ${msg.content}`;
        }

        detalheContainerEl.appendChild(p);
    });
}

async function salvarHistorico(userMessage, botMessage) {
  await fetch("/api/chat/salvar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userMessage, botMessage })
  });
}
