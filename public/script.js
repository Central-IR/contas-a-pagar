// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://contas-a-pagar-ytr6.onrender.com/api';

let contas = [];
let isOnline = false;
let lastDataHash = '';
let sessionToken = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let formType = 'simple'; // 'simple' ou 'parcelado'
let numParcelas = 0;
let currentGrupoId = null; // ID do grupo sendo editado
let parcelasDoGrupo = []; // Parcelas do grupo sendo editado
let tentativasReconexao = 0;
const MAX_TENTATIVAS = 3;

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ============================================
// QUEUE DE PROCESSAMENTO EM BACKGROUND
// ============================================
const processingQueue = {
    items: [],
    isProcessing: false,
    retryAttempts: 3
};

function addToQueue(item) {
    processingQueue.items.push({
        ...item,
        id: generateUUID(),
        attempts: 0,
        status: 'pending'
    });
}

async function processQueue() {
    if (processingQueue.isProcessing || processingQueue.items.length === 0) return;
    
    processingQueue.isProcessing = true;
    
    // Processar em lotes de 5 requisições paralelas
    const BATCH_SIZE = 5;
    
    while (processingQueue.items.length > 0) {
        const batch = processingQueue.items.slice(0, BATCH_SIZE);
        
        await Promise.allSettled(
            batch.map(item => processSingleItem(item))
        );
        
        // Remover itens processados com sucesso
        processingQueue.items = processingQueue.items.filter(
            item => item.status !== 'success'
        );
    }
    
    processingQueue.isProcessing = false;
}

async function processSingleItem(item) {
    try {
        const response = await fetch(`${API_URL}/contas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify(item.data),
            mode: 'cors'
        });

        if (tratarErroAutenticacao(response)) {
            item.status = 'auth_error';
            return;
        }

        if (response.ok) {
            const savedData = await response.json();
            
            // Atualizar conta temporária com dados reais do servidor
            const index = contas.findIndex(c => c.tempId === item.tempId);
            if (index !== -1) {
                contas[index] = savedData;
            }
            
            item.status = 'success';
            console.log(`✅ Parcela ${item.tempId} salva com sucesso`);
        } else {
            throw new Error(`Erro ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ Erro ao processar item ${item.tempId}:`, error);
        item.attempts++;
        
        if (item.attempts >= processingQueue.retryAttempts) {
            item.status = 'failed';
            showMessage(`Falha ao salvar parcela. Tente novamente.`, 'error');
            
            // Remover conta temporária que falhou
            contas = contas.filter(c => c.tempId !== item.tempId);
            updateDashboard();
            filterContas();
        } else {
            item.status = 'retry';
            // Aguardar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 1000 * item.attempts));
        }
    }
}

console.log('🚀 Contas a Pagar iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ============================================
// NAVEGAÇÃO POR MESES
// ============================================
function updateMonthDisplay() {
    const display = document.getElementById('currentMonthDisplay');
    if (display) {
        display.textContent = `${meses[currentMonth]} ${currentYear}`;
    }
    updateDashboard();
    filterContas();
}

window.previousMonth = function() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    updateMonthDisplay();
};

window.nextMonth = function() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    updateMonthDisplay();
};

// ============================================
// AUTENTICAÇÃO CORRIGIDA
// ============================================
function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('contasPagarSession', tokenFromUrl);
        sessionStorage.setItem('contasPagarSessionTime', Date.now().toString());
        window.history.replaceState({}, document.title, window.location.pathname);
        console.log('✅ Token recebido da URL');
    } else {
        sessionToken = sessionStorage.getItem('contasPagarSession');
        
        // Verificar se a sessão não expirou (24 horas)
        const sessionTime = sessionStorage.getItem('contasPagarSessionTime');
        if (sessionTime && sessionToken) {
            const timeDiff = Date.now() - parseInt(sessionTime);
            const hoursElapsed = timeDiff / (1000 * 60 * 60);
            
            if (hoursElapsed > 24) {
                console.log('⏰ Sessão expirada por tempo (>24h)');
                limparSessaoERedirecionarParaPortal();
                return;
            }
            console.log(`✅ Sessão válida (${hoursElapsed.toFixed(1)}h desde o login)`);
        }
    }

    if (!sessionToken) {
        console.log('❌ Nenhum token encontrado');
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function limparSessaoERedirecionarParaPortal() {
    sessionStorage.removeItem('contasPagarSession');
    sessionStorage.removeItem('contasPagarSessionTime');
    tentativasReconexao = 0;
    console.log('🔄 Redirecionando para o portal...');
    setTimeout(() => {
        window.location.href = PORTAL_URL;
    }, 2000);
    mostrarTelaAcessoNegado('Sua sessão expirou. Redirecionando...');
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function tratarErroAutenticacao(response) {
    if (response && response.status === 401) {
        console.log('❌ Token inválido ou sessão expirada (401)');
        tentativasReconexao++;
        
        if (tentativasReconexao < MAX_TENTATIVAS) {
            console.log(`🔄 Tentativa ${tentativasReconexao} de ${MAX_TENTATIVAS} - aguardando 2s...`);
            setTimeout(() => {
                checkServerStatus();
            }, 2000);
            return true;
        } else {
            console.log('❌ Máximo de tentativas atingido');
            limparSessaoERedirecionarParaPortal();
            return true;
        }
    }
    return false;
}

function inicializarApp() {
    console.log('🚀 Iniciando aplicação...');
    tentativasReconexao = 0; // Reset tentativas ao iniciar
    updateMonthDisplay();
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

// ============================================
// CONEXÃO E STATUS
// ============================================
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/contas`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (tratarErroAutenticacao(response)) return false;

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ SERVIDOR ONLINE - Sincronizando pendências...');
            tentativasReconexao = 0; // Reset ao conectar
            await loadContas();
            
            // Processar itens pendentes na fila
            if (processingQueue.items.length > 0) {
                showMessage('Sincronizando contas pendentes...', 'info');
                processQueue();
            }
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        console.error('❌ Erro ao verificar servidor:', error.message);
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

// ============================================
// CARREGAMENTO DE DADOS
// ============================================
async function loadContas() {
    if (!isOnline) return;

    try {
        const response = await fetch(`${API_URL}/contas`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (tratarErroAutenticacao(response)) return;

        if (!response.ok) return;

        const data = await response.json();
        contas = data;
        
        const newHash = JSON.stringify(contas.map(c => c.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            updateAllFilters();
            updateDashboard();
            filterContas();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar:', error);
    }
}

// ============================================
// CARREGAR PARCELAS DO GRUPO
// ============================================
async function loadParcelasDoGrupo(grupoId) {
    if (!isOnline || !grupoId) return [];

    try {
        const response = await fetch(`${API_URL}/contas/grupo/${grupoId}`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (tratarErroAutenticacao(response)) return [];

        if (!response.ok) return [];

        const data = await response.json();
        return data || [];
    } catch (error) {
        console.error('❌ Erro ao carregar parcelas do grupo:', error);
        return [];
    }
}

function startPolling() {
    loadContas();
    setInterval(() => {
        if (isOnline) loadContas();
    }, 10000);
}

// ============================================
// DASHBOARD
// ============================================
function updateDashboard() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const contasDoMes = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });
    
    const valorPago = contasDoMes
        .filter(c => c.status === 'PAGO')
        .reduce((sum, c) => sum + parseFloat(c.valor || 0), 0);
    
    const contasVencidas = contasDoMes.filter(c => {
        if (c.status === 'PAGO') return false;
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        dataVenc.setHours(0, 0, 0, 0);
        return dataVenc <= hoje;
    });
    const qtdVencido = contasVencidas.length;
    
    const valorTotal = contasDoMes.reduce((sum, c) => sum + parseFloat(c.valor || 0), 0);
    const valorPendente = valorTotal - valorPago;
    
    document.getElementById('statPagos').textContent = `R$ ${valorPago.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('statVencido').textContent = qtdVencido;
    document.getElementById('statPendente').textContent = `R$ ${valorPendente.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('statValorTotal').textContent = `R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    const cardVencido = document.getElementById('cardVencido');
    const badgeVencido = document.getElementById('pulseBadgeVencido');
    if (qtdVencido > 0) {
        cardVencido.classList.add('has-alert');
        badgeVencido.style.display = 'flex';
        badgeVencido.textContent = qtdVencido;
    } else {
        cardVencido.classList.remove('has-alert');
        badgeVencido.style.display = 'none';
    }
}

// ============================================
// FORMULÁRIO
// ============================================
window.toggleForm = function() {
    showFormModal(null);
};

async function showFormModal(editingId) {
    const isEditing = editingId !== null;
    let conta = null;
    
    if (isEditing) {
        conta = contas.find(c => String(c.id) === String(editingId));
        if (!conta) {
            showMessage('Conta não encontrada!', 'error');
            return;
        }
        
        // Carregar todas as parcelas do grupo se for uma conta parcelada
        if (conta.grupo_id) {
            currentGrupoId = conta.grupo_id;
            parcelasDoGrupo = await loadParcelasDoGrupo(conta.grupo_id);
            console.log('📦 Parcelas do grupo carregadas:', parcelasDoGrupo.length);
        } else {
            currentGrupoId = null;
            parcelasDoGrupo = [conta];
        }
    } else {
        currentGrupoId = null;
        parcelasDoGrupo = [];
    }

    // Reset form type
    formType = isEditing ? 'edit' : 'simple';
    numParcelas = 0;

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Conta' : 'Nova Conta'}</h3>
                </div>
                
                <!-- SELETOR DE TIPO DE CADASTRO -->
                ${!isEditing ? `
                <div class="form-type-selector">
                    <button type="button" class="form-type-btn active" onclick="selectFormType('simple')">
                        Cadastro Simples
                    </button>
                    <button type="button" class="form-type-btn" onclick="selectFormType('parcelado')">
                        Cadastro Parcelado
                    </button>
                </div>
                ` : ''}
                
                <div id="formContainer">
                    ${isEditing ? renderEditForm(conta, editingId) : renderSimpleForm(null, '', false)}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    applyUppercaseFields();
}

// ============================================
// RENDERIZAR FORMULÁRIO DE EDIÇÃO
// ============================================
function renderEditForm(conta, editingId) {
    const temParcelas = parcelasDoGrupo.length > 1;
    
    return `
        <div class="tabs-container">
            <div class="tabs-nav" id="editTabsNav">
                <button class="tab-btn active" onclick="switchFormTab(0)">Dados Gerais</button>
                ${temParcelas ? parcelasDoGrupo.map((p, idx) => 
                    `<button class="tab-btn" onclick="switchFormTab(${idx + 1})">${p.parcela_numero}ª Parcela</button>`
                ).join('') : ''}
                ${temParcelas ? '<button class="tab-btn add-parcela-btn" onclick="addNovaParcelaAoGrupo()">+ Adicionar Parcela</button>' : ''}
            </div>

            <form id="contaForm" onsubmit="handleEditSubmit(event)">
                <input type="hidden" id="editId" value="${editingId || ''}">
                <input type="hidden" id="grupoId" value="${currentGrupoId || ''}">
                <input type="hidden" id="formType" value="edit">
                <input type="hidden" id="temParcelas" value="${temParcelas}">
                
                <div class="tab-content active" id="tab-dados-gerais">
                    <div class="form-grid-compact">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="documento">NF / Documento</label>
                                <input type="text" id="documento" value="${conta?.documento || ''}" placeholder="NF, CTE...">
                            </div>
                            
                            <div class="form-group">
                                <label for="descricao">Descrição *</label>
                                <input type="text" id="descricao" value="${conta?.descricao || ''}" required>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group form-group-full">
                                <label for="observacoes">Observação</label>
                                <input type="text" id="observacoes" value="${conta?.observacoes || ''}">
                            </div>
                        </div>
                        
                        ${!temParcelas ? `
                        <div class="form-row">
                            <div class="form-group">
                                <label for="forma_pagamento">Forma de Pagamento *</label>
                                <select id="forma_pagamento" required>
                                    <option value="">Selecione...</option>
                                    <option value="PIX" ${conta?.forma_pagamento === 'PIX' ? 'selected' : ''}>Pix</option>
                                    <option value="BOLETO" ${conta?.forma_pagamento === 'BOLETO' ? 'selected' : ''}>Boleto</option>
                                    <option value="CARTAO" ${conta?.forma_pagamento === 'CARTAO' ? 'selected' : ''}>Cartão</option>
                                    <option value="DINHEIRO" ${conta?.forma_pagamento === 'DINHEIRO' ? 'selected' : ''}>Dinheiro</option>
                                    <option value="TRANSFERENCIA" ${conta?.forma_pagamento === 'TRANSFERENCIA' ? 'selected' : ''}>Transferência</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="banco">Banco *</label>
                                <select id="banco" required>
                                    <option value="">Selecione...</option>
                                    <option value="BANCO DO BRASIL" ${conta?.banco === 'BANCO DO BRASIL' ? 'selected' : ''}>Banco do Brasil</option>
                                    <option value="BRADESCO" ${conta?.banco === 'BRADESCO' ? 'selected' : ''}>Bradesco</option>
                                    <option value="SICOOB" ${conta?.banco === 'SICOOB' ? 'selected' : ''}>Sicoob</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="data_vencimento">Data de Vencimento *</label>
                                <input type="date" id="data_vencimento" value="${conta?.data_vencimento || ''}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="valor">Valor (R$) *</label>
                                <input type="number" id="valor" step="0.01" min="0" value="${conta?.valor || ''}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="data_pagamento">Data do Pagamento</label>
                                <input type="date" id="data_pagamento" value="${conta?.data_pagamento || ''}">
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                ${temParcelas ? renderParcelasExistentes() : ''}

                <div class="modal-actions">
                    <button type="submit" class="save">Atualizar</button>
                    <button type="button" class="danger" onclick="closeFormModal()">Cancelar</button>
                </div>
            </form>
        </div>
    `;
}

function renderParcelasExistentes() {
    return parcelasDoGrupo.map((parcela, idx) => `
        <div class="tab-content" id="tab-parcela-${idx}">
            <div class="form-grid-compact">
                <div class="form-row">
                    <div class="form-group">
                        <label for="parcela_forma_pagamento_${parcela.id}">Forma de Pagamento *</label>
                        <select id="parcela_forma_pagamento_${parcela.id}" class="parcela-field" data-parcela-id="${parcela.id}" required>
                            <option value="">Selecione...</option>
                            <option value="PIX" ${parcela.forma_pagamento === 'PIX' ? 'selected' : ''}>Pix</option>
                            <option value="BOLETO" ${parcela.forma_pagamento === 'BOLETO' ? 'selected' : ''}>Boleto</option>
                            <option value="CARTAO" ${parcela.forma_pagamento === 'CARTAO' ? 'selected' : ''}>Cartão</option>
                            <option value="DINHEIRO" ${parcela.forma_pagamento === 'DINHEIRO' ? 'selected' : ''}>Dinheiro</option>
                            <option value="TRANSFERENCIA" ${parcela.forma_pagamento === 'TRANSFERENCIA' ? 'selected' : ''}>Transferência</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="parcela_banco_${parcela.id}">Banco *</label>
                        <select id="parcela_banco_${parcela.id}" class="parcela-field" data-parcela-id="${parcela.id}" required>
                            <option value="">Selecione...</option>
                            <option value="BANCO DO BRASIL" ${parcela.banco === 'BANCO DO BRASIL' ? 'selected' : ''}>Banco do Brasil</option>
                            <option value="BRADESCO" ${parcela.banco === 'BRADESCO' ? 'selected' : ''}>Bradesco</option>
                            <option value="SICOOB" ${parcela.banco === 'SICOOB' ? 'selected' : ''}>Sicoob</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="parcela_vencimento_${parcela.id}">Data de Vencimento *</label>
                        <input type="date" 
                               id="parcela_vencimento_${parcela.id}" 
                               class="parcela-field" 
                               value="${parcela.data_vencimento}" 
                               data-parcela-id="${parcela.id}"
                               required>
                    </div>
                    
                    <div class="form-group">
                        <label for="parcela_valor_${parcela.id}">Valor (R$) *</label>
                        <input type="number" 
                               id="parcela_valor_${parcela.id}" 
                               class="parcela-field"
                               step="0.01" 
                               min="0" 
                               value="${parcela.valor}" 
                               data-parcela-id="${parcela.id}"
                               required>
                    </div>
                    
                    <div class="form-group">
                        <label for="parcela_pagamento_${parcela.id}">Data do Pagamento</label>
                        <input type="date" 
                               id="parcela_pagamento_${parcela.id}" 
                               class="parcela-field"
                               value="${parcela.data_pagamento || ''}" 
                               data-parcela-id="${parcela.id}">
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// ============================================
// ADICIONAR NOVA PARCELA AO GRUPO
// ============================================
window.addNovaParcelaAoGrupo = function() {
    const proximoNumero = parcelasDoGrupo.length + 1;
    const novaParcelaId = `nova_${Date.now()}`;
    
    // Adicionar nova aba
    const tabsNav = document.getElementById('editTabsNav');
    const addBtn = tabsNav.querySelector('.add-parcela-btn');
    
    const newTab = document.createElement('button');
    newTab.className = 'tab-btn';
    newTab.setAttribute('data-parcela-id', novaParcelaId);
    newTab.onclick = () => switchFormTab(proximoNumero);
    newTab.innerHTML = `${proximoNumero}ª Parcela <span class="remove-tab" onclick="event.stopPropagation(); removeNovaParcelaDoGrupo('${novaParcelaId}')">×</span>`;
    tabsNav.insertBefore(newTab, addBtn);
    
    // Adicionar conteúdo da parcela
    const form = document.getElementById('contaForm');
    const modalActions = form.querySelector('.modal-actions');
    
    const parcelaContent = document.createElement('div');
    parcelaContent.className = 'tab-content';
    parcelaContent.id = `tab-parcela-nova-${novaParcelaId}`;
    parcelaContent.setAttribute('data-parcela-id', novaParcelaId);
    parcelaContent.innerHTML = `
        <div class="form-grid-compact">
            <div class="form-row">
                <div class="form-group">
                    <label for="parcela_forma_pagamento_${novaParcelaId}">Forma de Pagamento *</label>
                    <select id="parcela_forma_pagamento_${novaParcelaId}" class="parcela-field nova-parcela" data-parcela-id="${novaParcelaId}" required>
                        <option value="">Selecione...</option>
                        <option value="PIX">Pix</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="CARTAO">Cartão</option>
                        <option value="DINHEIRO">Dinheiro</option>
                        <option value="TRANSFERENCIA">Transferência</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="parcela_banco_${novaParcelaId}">Banco *</label>
                    <select id="parcela_banco_${novaParcelaId}" class="parcela-field nova-parcela" data-parcela-id="${novaParcelaId}" required>
                        <option value="">Selecione...</option>
                        <option value="BANCO DO BRASIL">Banco do Brasil</option>
                        <option value="BRADESCO">Bradesco</option>
                        <option value="SICOOB">Sicoob</option>
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="parcela_vencimento_${novaParcelaId}">Data de Vencimento *</label>
                    <input type="date" 
                           id="parcela_vencimento_${novaParcelaId}" 
                           class="parcela-field nova-parcela" 
                           data-parcela-id="${novaParcelaId}"
                           required>
                </div>
                
                <div class="form-group">
                    <label for="parcela_valor_${novaParcelaId}">Valor (R$) *</label>
                    <input type="number" 
                           id="parcela_valor_${novaParcelaId}" 
                           class="parcela-field nova-parcela"
                           step="0.01" 
                           min="0" 
                           data-parcela-id="${novaParcelaId}"
                           required>
                </div>
                
                <div class="form-group">
                    <label for="parcela_pagamento_${novaParcelaId}">Data do Pagamento</label>
                    <input type="date" 
                           id="parcela_pagamento_${novaParcelaId}" 
                           class="parcela-field nova-parcela"
                           data-parcela-id="${novaParcelaId}">
                </div>
            </div>
        </div>
    `;
    
    form.insertBefore(parcelaContent, modalActions);
    
    // Adicionar à lista em memória
    parcelasDoGrupo.push({
        id: novaParcelaId,
        isNew: true,
        parcela_numero: proximoNumero
    });
    
    // Ativar a nova aba
    switchFormTab(proximoNumero);
};

window.removeNovaParcelaDoGrupo = function(parcelaId) {
    if (!confirm('Remover esta parcela?')) return;
    
    // Remover aba
    const tab = document.querySelector(`#editTabsNav button[data-parcela-id="${parcelaId}"]`);
    if (tab) tab.remove();
    
    // Remover conteúdo
    const content = document.getElementById(`tab-parcela-nova-${parcelaId}`);
    if (content) content.remove();
    
    // Remover da lista em memória
    parcelasDoGrupo = parcelasDoGrupo.filter(p => p.id !== parcelaId);
    
    // Renumerar abas
    const tabs = document.querySelectorAll('#editTabsNav .tab-btn[data-parcela-id]');
    tabs.forEach((tab, idx) => {
        const parcelaId = tab.getAttribute('data-parcela-id');
        const numero = idx + 1;
        tab.innerHTML = `${numero}ª Parcela <span class="remove-tab" onclick="event.stopPropagation(); removeNovaParcelaDoGrupo('${parcelaId}')">×</span>`;
        tab.onclick = () => switchFormTab(numero);
    });
};

function renderSimpleForm(conta, editingId, isEditing) {
    const numParcela = conta?.parcela_numero && conta?.parcela_total 
        ? `${conta.parcela_numero}/${conta.parcela_total}` 
        : '';

    return `
        <div class="tabs-container">
            <div class="tabs-nav">
                <button class="tab-btn active" onclick="switchFormTab(0)">Dados da Conta</button>
                <button class="tab-btn" onclick="switchFormTab(1)">Pagamento</button>
            </div>

            <form id="contaForm" onsubmit="handleSubmit(event)">
                <input type="hidden" id="editId" value="${editingId || ''}">
                <input type="hidden" id="formType" value="simple">
                
                <div class="tab-content active" id="tab-conta">
                    <div class="form-grid-compact">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="documento">NF / Documento</label>
                                <input type="text" id="documento" value="${conta?.documento || ''}" placeholder="NF, CTE...">
                            </div>
                            
                            <div class="form-group">
                                <label for="descricao">Descrição *</label>
                                <input type="text" id="descricao" value="${conta?.descricao || ''}" required>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group form-group-full">
                                <label for="observacoes">Observação</label>
                                <input type="text" id="observacoes" value="${conta?.observacoes || ''}">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="tab-pagamento">
                    <div class="form-grid-compact">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="forma_pagamento">Forma de Pagamento *</label>
                                <select id="forma_pagamento" required>
                                    <option value="">Selecione...</option>
                                    <option value="PIX" ${conta?.forma_pagamento === 'PIX' ? 'selected' : ''}>Pix</option>
                                    <option value="BOLETO" ${conta?.forma_pagamento === 'BOLETO' ? 'selected' : ''}>Boleto</option>
                                    <option value="CARTAO" ${conta?.forma_pagamento === 'CARTAO' ? 'selected' : ''}>Cartão</option>
                                    <option value="DINHEIRO" ${conta?.forma_pagamento === 'DINHEIRO' ? 'selected' : ''}>Dinheiro</option>
                                    <option value="TRANSFERENCIA" ${conta?.forma_pagamento === 'TRANSFERENCIA' ? 'selected' : ''}>Transferência</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="banco">Banco *</label>
                                <select id="banco" required>
                                    <option value="">Selecione...</option>
                                    <option value="BANCO DO BRASIL" ${conta?.banco === 'BANCO DO BRASIL' ? 'selected' : ''}>Banco do Brasil</option>
                                    <option value="BRADESCO" ${conta?.banco === 'BRADESCO' ? 'selected' : ''}>Bradesco</option>
                                    <option value="SICOOB" ${conta?.banco === 'SICOOB' ? 'selected' : ''}>Sicoob</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="data_vencimento">Data de Vencimento *</label>
                                <input type="date" id="data_vencimento" value="${conta?.data_vencimento || ''}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="valor">Valor (R$) *</label>
                                <input type="number" id="valor" step="0.01" min="0" value="${conta?.valor || ''}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="data_pagamento">Data do Pagamento</label>
                                <input type="date" id="data_pagamento" value="${conta?.data_pagamento || ''}">
                            </div>
                            
                            ${isEditing ? `
                            <div class="form-group">
                                <label for="num_parcela">Nº Parcelas</label>
                                <input type="text" id="num_parcela" value="${numParcela}" placeholder="1/1" readonly>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button type="submit" class="save">Salvar</button>
                    <button type="button" class="danger" onclick="closeFormModal()">Cancelar</button>
                </div>
            </form>
        </div>
    `;
}

function renderParceladoForm() {
    return `
        <div class="tabs-container">
            <div class="tabs-nav" id="parceladoTabsNav">
                <button class="tab-btn active" onclick="switchFormTab(0)">Dados da Conta</button>
                <button class="tab-btn" onclick="switchFormTab(1)">Pagamento</button>
                <button class="tab-btn add-parcela-btn" onclick="addParcelaTab()">+ Adicionar Parcela</button>
            </div>

            <form id="contaForm" onsubmit="handleSubmitParcelado(event)">
                <input type="hidden" id="formType" value="parcelado">
                
                <div class="tab-content active" id="tab-conta">
                    <div class="form-grid-compact">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="documento">NF / Documento</label>
                                <input type="text" id="documento" value="" placeholder="NF, CTE...">
                            </div>
                            
                            <div class="form-group">
                                <label for="descricao">Descrição *</label>
                                <input type="text" id="descricao" value="" required>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group form-group-full">
                                <label for="observacoes">Observação</label>
                                <input type="text" id="observacoes" value="">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="tab-pagamento">
                    <div class="form-grid-compact">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="forma_pagamento">Forma de Pagamento *</label>
                                <select id="forma_pagamento" required>
                                    <option value="">Selecione...</option>
                                    <option value="BOLETO">Boleto</option>
                                    <option value="CARTAO">Cartão</option>
                                    <option value="DINHEIRO">Dinheiro</option>
                                    <option value="TRANSFERENCIA">Transferência</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="banco">Banco *</label>
                                <select id="banco" required>
                                    <option value="">Selecione...</option>
                                    <option value="BANCO DO BRASIL">Banco do Brasil</option>
                                    <option value="BRADESCO">Bradesco</option>
                                    <option value="SICOOB">Sicoob</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="parcelasContainer"></div>

                <div class="modal-actions">
                    <button type="submit" class="save">Salvar Todas as Parcelas</button>
                    <button type="button" class="danger" onclick="closeFormModal()">Cancelar</button>
                </div>
            </form>
        </div>
    `;
}

window.selectFormType = function(type) {
    formType = type;
    
    // Atualizar botões de seleção
    document.querySelectorAll('.form-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Renderizar formulário apropriado
    const container = document.getElementById('formContainer');
    if (type === 'simple') {
        container.innerHTML = renderSimpleForm(null, '', false);
    } else {
        container.innerHTML = renderParceladoForm();
    }
    
    applyUppercaseFields();
};

window.addParcelaTab = function() {
    numParcelas++;
    const tabsNav = document.getElementById('parceladoTabsNav');
    const addBtn = tabsNav.querySelector('.add-parcela-btn');
    
    // Adicionar nova aba antes do botão "+"
    const newTab = document.createElement('button');
    newTab.className = 'tab-btn';
    newTab.setAttribute('data-parcela-num', numParcelas);
    newTab.onclick = () => switchFormTab(numParcelas + 1);
    newTab.innerHTML = `${numParcelas}ª Parcela <span class="remove-tab" onclick="event.stopPropagation(); removeParcelaTab(${numParcelas})">×</span>`;
    tabsNav.insertBefore(newTab, addBtn);
    
    // Adicionar conteúdo da parcela
    const parcelasContainer = document.getElementById('parcelasContainer');
    const parcelaContent = document.createElement('div');
    parcelaContent.className = 'tab-content';
    parcelaContent.id = `tab-parcela-${numParcelas}`;
    parcelaContent.setAttribute('data-parcela-num', numParcelas);
    parcelaContent.innerHTML = `
        <div class="form-grid-compact">
            <div class="form-row">
                <div class="form-group">
                    <label for="parcela_vencimento_${numParcelas}">Data de Vencimento *</label>
                    <input type="date" id="parcela_vencimento_${numParcelas}" class="parcela-field" required>
                </div>
                <div class="form-group">
                    <label for="parcela_valor_${numParcelas}">Valor (R$) *</label>
                    <input type="number" id="parcela_valor_${numParcelas}" step="0.01" min="0" class="parcela-field" required>
                </div>
            </div>
        </div>
    `;
    parcelasContainer.appendChild(parcelaContent);
    
    // Ativar a nova aba
    switchFormTab(numParcelas + 1);
};

window.removeParcelaTab = function(parcelaNum) {
    if (!confirm(`Remover ${parcelaNum}ª Parcela?`)) return;
    
    // Remover aba
    const tab = document.querySelector(`#parceladoTabsNav .tab-btn[data-parcela-num="${parcelaNum}"]`);
    if (tab) tab.remove();
    
    // Remover conteúdo
    const content = document.getElementById(`tab-parcela-${parcelaNum}`);
    if (content) content.remove();
    
    // Renumerar parcelas restantes
    renumberParcelas();
};

function renumberParcelas() {
    const tabs = document.querySelectorAll('#parceladoTabsNav .tab-btn[data-parcela-num]');
    const contents = document.querySelectorAll('#parcelasContainer .tab-content[data-parcela-num]');
    
    let newNum = 0;
    const mapping = {};
    
    tabs.forEach((tab, index) => {
        newNum++;
        const oldNum = parseInt(tab.getAttribute('data-parcela-num'));
        mapping[oldNum] = newNum;
        
        tab.setAttribute('data-parcela-num', newNum);
        tab.innerHTML = `${newNum}ª Parcela <span class="remove-tab" onclick="event.stopPropagation(); removeParcelaTab(${newNum})">×</span>`;
        tab.onclick = () => switchFormTab(newNum + 1);
    });
    
    contents.forEach((content, index) => {
        const oldNum = parseInt(content.getAttribute('data-parcela-num'));
        const newNum = mapping[oldNum];
        
        content.setAttribute('data-parcela-num', newNum);
        content.id = `tab-parcela-${newNum}`;
        
        // Atualizar IDs dos campos
        const vencField = content.querySelector('input[type="date"]');
        const valorField = content.querySelector('input[type="number"]');
        
        if (vencField) {
            vencField.id = `parcela_vencimento_${newNum}`;
        }
        if (valorField) {
            valorField.id = `parcela_valor_${newNum}`;
        }
    });
    
    numParcelas = newNum;
}

function applyUppercaseFields() {
    ['descricao', 'observacoes', 'documento'].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            campo.addEventListener('input', e => {
                const pos = e.target.selectionStart;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(pos, pos);
            });
            campo.style.textTransform = 'uppercase';
        }
    });
}

window.switchFormTab = function(index) {
    document.querySelectorAll('#formModal .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    document.querySelectorAll('#formModal .tab-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
    
    // Reset
    currentGrupoId = null;
    parcelasDoGrupo = [];
}

// ============================================
// SUBMIT SIMPLES OTIMIZADO
// ============================================
async function handleSubmit(event) {
    event.preventDefault();
    const editId = document.getElementById('editId').value;
    
    if (editId) {
        // Edição usa o fluxo normal
        await salvarConta(editId);
    } else {
        // Novo cadastro usa cadastro otimista
        await salvarContaOtimista();
    }
}

async function salvarContaOtimista() {
    // Validação dos campos obrigatórios
    const descricao = document.getElementById('descricao')?.value?.trim();
    const valor = document.getElementById('valor')?.value;
    const dataVencimento = document.getElementById('data_vencimento')?.value;
    const formaPagamento = document.getElementById('forma_pagamento')?.value;
    const banco = document.getElementById('banco')?.value;

    if (!descricao || !valor || !dataVencimento || !formaPagamento || !banco) {
        showMessage('Por favor, preencha todos os campos obrigatórios.', 'error');
        return;
    }

    const formData = {
        documento: document.getElementById('documento')?.value?.trim() || null,
        descricao: descricao,
        valor: parseFloat(valor),
        data_vencimento: dataVencimento,
        forma_pagamento: formaPagamento,
        banco: banco,
        data_pagamento: document.getElementById('data_pagamento')?.value || null,
        observacoes: document.getElementById('observacoes')?.value?.trim() || null,
        status: document.getElementById('data_pagamento')?.value ? 'PAGO' : 'PENDENTE'
    };

    // Validar valor numérico
    if (isNaN(formData.valor) || formData.valor <= 0) {
        showMessage('Valor inválido. Digite um número maior que zero.', 'error');
        return;
    }

    // ====== CADASTRO OTIMISTA ======
    
    // 1. Criar conta temporária
    const tempId = `temp_${Date.now()}`;
    const contaTemporaria = {
        ...formData,
        id: null,
        tempId: tempId,
        synced: false
    };
    
    // 2. Adicionar localmente
    contas.push(contaTemporaria);
    
    // 3. Atualizar UI imediatamente
    lastDataHash = JSON.stringify(contas.map(c => c.id || c.tempId));
    updateAllFilters();
    updateDashboard();
    filterContas();
    closeFormModal();
    
    showMessage('Conta cadastrada! Sincronizando...', 'success');
    
    // 4. Adicionar à fila de processamento
    if (!isOnline) {
        showMessage('Sistema offline. A conta será sincronizada quando voltar online.', 'warning');
        return;
    }
    
    addToQueue({
        tempId: tempId,
        data: formData
    });
    
    processQueue();
}

// ============================================
// SUBMIT EDIÇÃO DE GRUPO OTIMIZADO
// ============================================
async function handleEditSubmit(event) {
    event.preventDefault();
    
    // Verificar se é conta simples ou parcelada
    const temParcelas = document.getElementById('temParcelas')?.value === 'true';
    
    if (!temParcelas) {
        // É uma conta simples - usar edição otimista
        const editId = document.getElementById('editId').value;
        await editarContaOtimista(editId);
        return;
    }
    
    // É uma conta parcelada - processar todas as parcelas
    // Coletar dados comuns
    const descricao = document.getElementById('descricao')?.value?.trim();
    const documento = document.getElementById('documento')?.value?.trim() || null;
    const observacoes = document.getElementById('observacoes')?.value?.trim() || null;

    if (!descricao) {
        showMessage('Por favor, preencha a descrição.', 'error');
        return;
    }

    const dadosComuns = { descricao, documento, observacoes };
    
    if (!isOnline) {
        showMessage('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }
    
    // ====== EDIÇÃO OTIMISTA PARA PARCELAS ======
    
    // 1. Coletar todas as atualizações
    const atualizacoes = [];
    const backupOriginal = [];
    
    // Backup e atualização local das parcelas existentes
    for (const parcela of parcelasDoGrupo) {
        if (parcela.isNew) continue;
        
        const vencInput = document.getElementById(`parcela_vencimento_${parcela.id}`);
        const valorInput = document.getElementById(`parcela_valor_${parcela.id}`);
        const pagInput = document.getElementById(`parcela_pagamento_${parcela.id}`);
        const formaPagInput = document.getElementById(`parcela_forma_pagamento_${parcela.id}`);
        const bancoInput = document.getElementById(`parcela_banco_${parcela.id}`);
        
        if (!vencInput || !valorInput || !formaPagInput || !bancoInput) continue;
        
        const index = contas.findIndex(c => String(c.id) === String(parcela.id));
        if (index !== -1) {
            // Fazer backup
            backupOriginal.push({ index, data: {...contas[index]} });
            
            // Atualizar localmente
            contas[index] = {
                ...contas[index],
                ...dadosComuns,
                valor: parseFloat(valorInput.value),
                data_vencimento: vencInput.value,
                data_pagamento: pagInput?.value || null,
                forma_pagamento: formaPagInput.value,
                banco: bancoInput.value,
                status: pagInput?.value ? 'PAGO' : 'PENDENTE',
                parcela_numero: parcela.parcela_numero,
                parcela_total: parcelasDoGrupo.filter(p => !p.isNew).length,
                synced: false
            };
            
            // Adicionar à lista de atualizações
            atualizacoes.push({
                id: parcela.id,
                data: {
                    ...dadosComuns,
                    valor: parseFloat(valorInput.value),
                    data_vencimento: vencInput.value,
                    data_pagamento: pagInput?.value || null,
                    forma_pagamento: formaPagInput.value,
                    banco: bancoInput.value,
                    status: pagInput?.value ? 'PAGO' : 'PENDENTE',
                    parcela_numero: parcela.parcela_numero,
                    parcela_total: parcelasDoGrupo.filter(p => !p.isNew).length
                }
            });
        }
    }
    
    // Adicionar novas parcelas temporariamente
    const novasParcelas = parcelasDoGrupo.filter(p => p.isNew);
    const totalParcelas = parcelasDoGrupo.length;
    
    for (const novaParcela of novasParcelas) {
        const vencInput = document.getElementById(`parcela_vencimento_${novaParcela.id}`);
        const valorInput = document.getElementById(`parcela_valor_${novaParcela.id}`);
        const pagInput = document.getElementById(`parcela_pagamento_${novaParcela.id}`);
        const formaPagInput = document.getElementById(`parcela_forma_pagamento_${novaParcela.id}`);
        const bancoInput = document.getElementById(`parcela_banco_${novaParcela.id}`);
        
        if (!vencInput || !valorInput || !formaPagInput || !bancoInput) continue;
        
        const tempParcela = {
            ...dadosComuns,
            valor: parseFloat(valorInput.value),
            data_vencimento: vencInput.value,
            data_pagamento: pagInput?.value || null,
            forma_pagamento: formaPagInput.value,
            banco: bancoInput.value,
            status: pagInput?.value ? 'PAGO' : 'PENDENTE',
            parcela_numero: novaParcela.parcela_numero,
            parcela_total: totalParcelas,
            grupo_id: currentGrupoId,
            id: null,
            tempId: novaParcela.id,
            synced: false
        };
        
        contas.push(tempParcela);
        
        atualizacoes.push({
            isNew: true,
            tempId: novaParcela.id,
            data: {
                ...dadosComuns,
                valor: parseFloat(valorInput.value),
                data_vencimento: vencInput.value,
                data_pagamento: pagInput?.value || null,
                forma_pagamento: formaPagInput.value,
                banco: bancoInput.value,
                status: pagInput?.value ? 'PAGO' : 'PENDENTE',
                parcela_numero: novaParcela.parcela_numero,
                parcela_total: totalParcelas,
                grupo_id: currentGrupoId
            }
        });
    }
    
    // 2. Atualizar UI imediatamente
    lastDataHash = JSON.stringify(contas.map(c => c.id || c.tempId));
    updateAllFilters();
    updateDashboard();
    filterContas();
    closeFormModal();
    
    showMessage(`Atualizando ${atualizacoes.length} parcela(s)...`, 'success');
    
    // 3. Processar atualizações em background (lotes de 5)
    processEditQueue(atualizacoes, backupOriginal, totalParcelas);
}

async function processEditQueue(atualizacoes, backupOriginal, totalParcelas) {
    const BATCH_SIZE = 5;
    let sucessos = 0;
    let erros = [];
    
    // Processar em lotes
    for (let i = 0; i < atualizacoes.length; i += BATCH_SIZE) {
        const batch = atualizacoes.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
            batch.map(async (item) => {
                if (item.isNew) {
                    // Criar nova parcela
                    const response = await fetch(`${API_URL}/contas`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Token': sessionToken,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(item.data),
                        mode: 'cors'
                    });
                    
                    if (!response.ok) throw new Error(`Erro ${response.status}`);
                    
                    const savedData = await response.json();
                    
                    // Atualizar conta temporária
                    const index = contas.findIndex(c => c.tempId === item.tempId);
                    if (index !== -1) {
                        contas[index] = savedData;
                    }
                    
                    return { success: true, id: item.tempId };
                } else {
                    // Atualizar parcela existente
                    const response = await fetch(`${API_URL}/contas/${item.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Token': sessionToken,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(item.data),
                        mode: 'cors'
                    });
                    
                    if (!response.ok) throw new Error(`Erro ${response.status}`);
                    
                    const savedData = await response.json();
                    
                    // Atualizar com dados do servidor
                    const index = contas.findIndex(c => String(c.id) === String(item.id));
                    if (index !== -1) {
                        contas[index] = savedData;
                    }
                    
                    return { success: true, id: item.id };
                }
            })
        );
        
        // Contabilizar resultados
        results.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                sucessos++;
            } else {
                const item = batch[idx];
                erros.push(`Parcela ${item.data.parcela_numero}: ${result.reason.message}`);
                
                // Reverter alteração em caso de erro
                if (!item.isNew) {
                    const backup = backupOriginal.find(b => contas[b.index]?.id === item.id);
                    if (backup) {
                        contas[backup.index] = backup.data;
                    }
                } else {
                    contas = contas.filter(c => c.tempId !== item.tempId);
                }
            }
        });
    }
    
    // Atualizar parcela_total em todas as parcelas do grupo (não bloqueia)
    if (sucessos > 0 && totalParcelas) {
        Promise.allSettled(
            atualizacoes.filter(a => !a.isNew).map(item =>
                fetch(`${API_URL}/contas/${item.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Token': sessionToken,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ parcela_total: totalParcelas }),
                    mode: 'cors'
                })
            )
        );
    }
    
    // Atualizar UI final
    lastDataHash = JSON.stringify(contas.map(c => c.id));
    updateAllFilters();
    updateDashboard();
    filterContas();
    
    // Mostrar resultado final
    if (erros.length === 0) {
        showMessage(`✅ ${sucessos} parcela(s) atualizadas com sucesso!`, 'success');
    } else {
        showMessage(`⚠️ ${sucessos} de ${atualizacoes.length} parcelas atualizadas. Erros: ${erros.join('; ')}`, 'warning');
    }
}

// ============================================
// SUBMIT PARCELADO OTIMIZADO
// ============================================
async function handleSubmitParcelado(event) {
    event.preventDefault();
    
    if (numParcelas === 0) {
        showMessage('Adicione pelo menos uma parcela!', 'error');
        return;
    }
    
    // Validar campos comuns
    const descricao = document.getElementById('descricao')?.value?.trim();
    const formaPagamento = document.getElementById('forma_pagamento')?.value;
    const banco = document.getElementById('banco')?.value;

    if (!descricao || !formaPagamento || !banco) {
        showMessage('Por favor, preencha todos os campos obrigatórios das abas 1 e 2.', 'error');
        return;
    }

    // Coletar dados comuns
    const dadosComuns = {
        documento: document.getElementById('documento')?.value?.trim() || null,
        descricao: descricao,
        observacoes: document.getElementById('observacoes')?.value?.trim() || null,
        forma_pagamento: formaPagamento,
        banco: banco,
    };
    
    // Gerar grupo_id único para todas as parcelas
    const grupoId = generateUUID();
    
    // Coletar e validar dados de cada parcela
    const parcelas = [];
    for (let i = 1; i <= numParcelas; i++) {
        const vencimento = document.getElementById(`parcela_vencimento_${i}`);
        const valor = document.getElementById(`parcela_valor_${i}`);
        
        if (!vencimento || !vencimento.value) {
            showMessage(`Parcela ${i}: Data de vencimento não preenchida!`, 'error');
            return;
        }
        
        if (!valor || !valor.value || parseFloat(valor.value) <= 0) {
            showMessage(`Parcela ${i}: Valor inválido!`, 'error');
            return;
        }
        
        if (vencimento && valor) {
            parcelas.push({
                ...dadosComuns,
                data_vencimento: vencimento.value,
                valor: parseFloat(valor.value),
                parcela_numero: i,
                parcela_total: numParcelas,
                status: 'PENDENTE',
                data_pagamento: null,
                grupo_id: grupoId
            });
        }
    }
    
    if (parcelas.length === 0) {
        showMessage('Nenhuma parcela válida encontrada!', 'error');
        return;
    }
    
    // ====== OTIMIZAÇÃO: CADASTRO INSTANTÂNEO ======
    
    // 1. Criar contas temporárias localmente (INSTANTÂNEO)
    const contasTemporarias = parcelas.map((parcela, index) => ({
        ...parcela,
        id: null,
        tempId: `temp_${grupoId}_${index}`,
        synced: false
    }));
    
    // 2. Adicionar à lista local imediatamente
    contas.push(...contasTemporarias);
    
    // 3. Atualizar interface (INSTANTÂNEO)
    lastDataHash = JSON.stringify(contas.map(c => c.id || c.tempId));
    updateAllFilters();
    updateDashboard();
    filterContas();
    
    // 4. Fechar modal imediatamente
    closeFormModal();
    
    // 5. Mostrar feedback de sucesso instantâneo
    showMessage(`${parcelas.length} parcelas cadastradas! Sincronizando...`, 'success');
    
    // 6. Adicionar à fila de processamento em background
    parcelas.forEach((parcela, index) => {
        addToQueue({
            tempId: `temp_${grupoId}_${index}`,
            data: parcela
        });
    });
    
    // 7. Processar fila em background (NÃO BLOQUEIA A UI)
    if (!isOnline) {
        showMessage('Sistema offline. As parcelas serão sincronizadas quando voltar online.', 'warning');
        return;
    }
    
    processQueue().then(() => {
        // Atualizar interface após sincronização completa
        lastDataHash = JSON.stringify(contas.map(c => c.id));
        updateAllFilters();
        updateDashboard();
        filterContas();
        
        const sucessos = contas.filter(c => c.grupo_id === grupoId && c.id !== null).length;
        if (sucessos === parcelas.length) {
            showMessage(`✅ Todas as ${parcelas.length} parcelas foram sincronizadas!`, 'success');
        }
    });
}

// Manter a função salvarConta original para edições
async function salvarConta(editId) {
    // Validação dos campos obrigatórios
    const descricao = document.getElementById('descricao')?.value?.trim();
    const valor = document.getElementById('valor')?.value;
    const dataVencimento = document.getElementById('data_vencimento')?.value;
    const formaPagamento = document.getElementById('forma_pagamento')?.value;
    const banco = document.getElementById('banco')?.value;

    if (!descricao || !valor || !dataVencimento || !formaPagamento || !banco) {
        showMessage('Por favor, preencha todos os campos obrigatórios.', 'error');
        return;
    }

    const formData = {
        documento: document.getElementById('documento')?.value?.trim() || null,
        descricao: descricao,
        valor: parseFloat(valor),
        data_vencimento: dataVencimento,
        forma_pagamento: formaPagamento,
        banco: banco,
        data_pagamento: document.getElementById('data_pagamento')?.value || null,
        observacoes: document.getElementById('observacoes')?.value?.trim() || null,
    };

    // Validar valor numérico
    if (isNaN(formData.valor) || formData.valor <= 0) {
        showMessage('Valor inválido. Digite um número maior que zero.', 'error');
        return;
    }

    // Apenas para edição, manter parcela_numero e parcela_total
    if (editId) {
        const conta = contas.find(c => String(c.id) === String(editId));
        if (conta) {
            formData.parcela_numero = conta.parcela_numero;
            formData.parcela_total = conta.parcela_total;
        }
    }

    if (editId) {
        const conta = contas.find(c => String(c.id) === String(editId));
        if (conta && !formData.data_pagamento) {
            formData.status = conta.status;
        } else {
            formData.status = formData.data_pagamento ? 'PAGO' : 'PENDENTE';
        }
    } else {
        formData.status = formData.data_pagamento ? 'PAGO' : 'PENDENTE';
    }

    if (!isOnline) {
        showMessage('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }

    try {
        const url = editId ? `${API_URL}/contas/${editId}` : `${API_URL}/contas`;
        const method = editId ? 'PUT' : 'POST';

        console.log('Enviando dados:', formData);

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        if (tratarErroAutenticacao(response)) return;

        if (!response.ok) {
            let errorMessage = 'Erro ao salvar';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const savedData = await response.json();

        if (editId) {
            const index = contas.findIndex(c => String(c.id) === String(editId));
            if (index !== -1) contas[index] = savedData;
            showMessage('Conta atualizada com sucesso!', 'success');
        } else {
            contas.push(savedData);
            showMessage('Conta criada com sucesso!', 'success');
        }

        lastDataHash = JSON.stringify(contas.map(c => c.id));
        updateAllFilters();
        updateDashboard();
        filterContas();
        closeFormModal();
    } catch (error) {
        console.error('Erro completo:', error);
        showMessage(`Erro: ${error.message}`, 'error');
    }
}

// ============================================
// EDIÇÃO OTIMISTA PARA CONTA SIMPLES
// ============================================
async function editarContaOtimista(editId) {
    // Validação dos campos obrigatórios
    const descricao = document.getElementById('descricao')?.value?.trim();
    const valor = document.getElementById('valor')?.value;
    const dataVencimento = document.getElementById('data_vencimento')?.value;
    const formaPagamento = document.getElementById('forma_pagamento')?.value;
    const banco = document.getElementById('banco')?.value;

    if (!descricao || !valor || !dataVencimento || !formaPagamento || !banco) {
        showMessage('Por favor, preencha todos os campos obrigatórios.', 'error');
        return;
    }

    const formData = {
        documento: document.getElementById('documento')?.value?.trim() || null,
        descricao: descricao,
        valor: parseFloat(valor),
        data_vencimento: dataVencimento,
        forma_pagamento: formaPagamento,
        banco: banco,
        data_pagamento: document.getElementById('data_pagamento')?.value || null,
        observacoes: document.getElementById('observacoes')?.value?.trim() || null,
    };

    // Validar valor numérico
    if (isNaN(formData.valor) || formData.valor <= 0) {
        showMessage('Valor inválido. Digite um número maior que zero.', 'error');
        return;
    }

    // Manter parcela_numero e parcela_total
    const contaOriginal = contas.find(c => String(c.id) === String(editId));
    if (!contaOriginal) {
        showMessage('Conta não encontrada!', 'error');
        return;
    }

    formData.parcela_numero = contaOriginal.parcela_numero;
    formData.parcela_total = contaOriginal.parcela_total;

    if (!formData.data_pagamento) {
        formData.status = contaOriginal.status;
    } else {
        formData.status = 'PAGO';
    }

    if (!isOnline) {
        showMessage('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }

    // ====== EDIÇÃO OTIMISTA ======
    
    // 1. Fazer backup da conta original
    const backup = {...contaOriginal};
    const index = contas.findIndex(c => String(c.id) === String(editId));
    
    // 2. Atualizar localmente IMEDIATAMENTE
    contas[index] = {
        ...contaOriginal,
        ...formData,
        synced: false
    };
    
    // 3. Atualizar UI imediatamente
    lastDataHash = JSON.stringify(contas.map(c => c.id));
    updateAllFilters();
    updateDashboard();
    filterContas();
    closeFormModal();
    
    showMessage('Conta atualizada! Sincronizando...', 'success');
    
    // 4. Sincronizar em background
    try {
        const response = await fetch(`${API_URL}/contas/${editId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        if (tratarErroAutenticacao(response)) {
            // Reverter em caso de erro de autenticação
            contas[index] = backup;
            updateDashboard();
            filterContas();
            return;
        }

        if (!response.ok) {
            let errorMessage = 'Erro ao salvar';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const savedData = await response.json();
        
        // Atualizar com dados reais do servidor
        contas[index] = savedData;
        
        lastDataHash = JSON.stringify(contas.map(c => c.id));
        updateAllFilters();
        updateDashboard();
        filterContas();
        
        showMessage('✅ Conta sincronizada com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao sincronizar:', error);
        
        // Reverter alteração em caso de erro
        contas[index] = backup;
        updateDashboard();
        filterContas();
        
        showMessage(`❌ Erro ao sincronizar: ${error.message}`, 'error');
    }
}

// ============================================
// TOGGLE PAGO
// ============================================
window.togglePago = async function(id) {
    const idStr = String(id);
    const conta = contas.find(c => String(c.id) === idStr);
    if (!conta) return;

    const novoStatus = conta.status === 'PAGO' ? 'PENDENTE' : 'PAGO';
    const novaData = novoStatus === 'PAGO' ? new Date().toISOString().split('T')[0] : null;

    const old = { status: conta.status, data: conta.data_pagamento };
    conta.status = novoStatus;
    conta.data_pagamento = novaData;
    updateDashboard();
    filterContas();
    
    showMessage(`Conta marcada como ${novoStatus === 'PAGO' ? 'paga' : 'pendente'}!`, 'success');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/contas/${idStr}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ status: novoStatus, data_pagamento: novaData }),
                mode: 'cors'
            });

            if (tratarErroAutenticacao(response)) return;

            if (!response.ok) throw new Error('Erro ao atualizar');

            const data = await response.json();
            const index = contas.findIndex(c => String(c.id) === idStr);
            if (index !== -1) contas[index] = data;
        } catch (error) {
            conta.status = old.status;
            conta.data_pagamento = old.data;
            updateDashboard();
            filterContas();
            showMessage('Erro ao atualizar status', 'error');
        }
    }
};

// ============================================
// EDIÇÃO E EXCLUSÃO
// ============================================
window.editConta = function(id) {
    showFormModal(String(id));
};

window.deleteConta = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta conta?')) return;

    const idStr = String(id);
    const deleted = contas.find(c => String(c.id) === idStr);
    contas = contas.filter(c => String(c.id) !== idStr);
    updateAllFilters();
    updateDashboard();
    filterContas();
    showMessage('Conta excluída!', 'success');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/contas/${idStr}`, {
                method: 'DELETE',
                headers: {
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            if (tratarErroAutenticacao(response)) return;

            if (!response.ok) throw new Error('Erro ao deletar');
        } catch (error) {
            if (deleted) {
                contas.push(deleted);
                updateAllFilters();
                updateDashboard();
                filterContas();
                showMessage('Erro ao excluir conta', 'error');
            }
        }
    }
};

// ============================================
// VISUALIZAÇÃO
// ============================================
window.viewConta = function(id) {
    const idStr = String(id);
    const conta = contas.find(c => String(c.id) === idStr);
    
    if (!conta) {
        showMessage('Conta não encontrada!', 'error');
        return;
    }

    const parcelaInfo = conta.parcela_numero && conta.parcela_total 
        ? `
        <div class="info-item">
            <span class="info-label">Parcela:</span>
            <span class="info-value">${conta.parcela_numero}ª de ${conta.parcela_total}</span>
        </div>
        ` 
        : '';

    const documentoInfo = conta.documento 
        ? `
        <div class="info-item">
            <span class="info-label">Documento:</span>
            <span class="info-value">${conta.documento}</span>
        </div>
        ` 
        : '';

    const observacoesInfo = conta.observacoes 
        ? `
        <div class="info-item info-item-full">
            <span class="info-label">Observações:</span>
            <span class="info-value">${conta.observacoes}</span>
        </div>
        ` 
        : '';

    const modal = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content modal-view">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Conta</h3>
                </div>
                <div class="info-grid">
                    ${documentoInfo}
                    <div class="info-item info-item-full">
                        <span class="info-label">Descrição:</span>
                        <span class="info-value">${conta.descricao}</span>
                    </div>
                    ${parcelaInfo}
                    <div class="info-item">
                        <span class="info-label">Valor:</span>
                        <span class="info-value info-highlight">R$ ${parseFloat(conta.valor).toFixed(2)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Vencimento:</span>
                        <span class="info-value">${formatDate(conta.data_vencimento)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Forma de Pagamento:</span>
                        <span class="info-value">${conta.forma_pagamento}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Banco:</span>
                        <span class="info-value">${conta.banco}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">${conta.data_pagamento ? 'Data do Pagamento:' : 'Status:'}</span>
                        <span class="info-value">${conta.data_pagamento ? formatDate(conta.data_pagamento) : 'Não pago'}</span>
                    </div>
                    ${observacoesInfo}
                </div>
                <div class="modal-actions">
                    <button class="secondary" onclick="closeViewModal()">Fechar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modal);
};

window.closeViewModal = function() {
    const modal = document.getElementById('viewModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
};

// ============================================
// FILTROS
// ============================================
function updateAllFilters() {
    const bancos = new Set();
    contas.forEach(c => {
        if (c.banco?.trim()) bancos.add(c.banco.trim());
    });
    
    const select = document.getElementById('filterBanco');
    if (select) {
        const val = select.value;
        select.innerHTML = '<option value="">Todos</option>';
        Array.from(bancos).sort().forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            select.appendChild(opt);
        });
        select.value = val;
    }
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const contasDoMes = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });
    
    let temVencido = false, temPago = false, temPendente = false;
    
    contasDoMes.forEach(c => {
        if (c.status === 'PAGO') {
            temPago = true;
        } else {
            const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
            dataVenc.setHours(0, 0, 0, 0);
            
            if (dataVenc <= hoje) {
                temVencido = true;
            } else {
                temPendente = true;
            }
        }
    });

    const statusSelect = document.getElementById('filterStatus');
    if (statusSelect) {
        const val = statusSelect.value;
        statusSelect.innerHTML = '<option value="">Todos</option>';
        if (temPago) statusSelect.innerHTML += '<option value="PAGO">Pago</option>';
        if (temVencido) statusSelect.innerHTML += '<option value="VENCIDO">Vencido</option>';
        if (temPendente) statusSelect.innerHTML += '<option value="PENDENTE">Pendente</option>';
        statusSelect.value = val;
    }
}

function filterContas() {
    const search = (document.getElementById('search')?.value || '').toLowerCase();
    const banco = document.getElementById('filterBanco')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const pagamento = document.getElementById('filterPagamento')?.value || '';
    
    let filtered = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        const mesMatch = dataVenc.getMonth() === currentMonth;
        const anoMatch = dataVenc.getFullYear() === currentYear;
        return mesMatch && anoMatch;
    });

    if (banco) {
        filtered = filtered.filter(c => c.banco === banco);
    }
    
    if (pagamento) {
        filtered = filtered.filter(c => c.forma_pagamento === pagamento);
    }
    
    if (status) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        filtered = filtered.filter(c => {
            if (status === 'PAGO') return c.status === 'PAGO';
            
            if (status === 'VENCIDO') {
                if (c.status === 'PAGO') return false;
                const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
                dataVenc.setHours(0, 0, 0, 0);
                return dataVenc <= hoje;
            }
            
            if (status === 'PENDENTE') {
                if (c.status === 'PAGO') return false;
                const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
                dataVenc.setHours(0, 0, 0, 0);
                return dataVenc > hoje;
            }
            
            return true;
        });
    }

    if (search) {
        filtered = filtered.filter(c => 
            (c.descricao || '').toLowerCase().includes(search) ||
            (c.banco || '').toLowerCase().includes(search) ||
            (c.forma_pagamento || '').toLowerCase().includes(search) ||
            (c.observacoes || '').toLowerCase().includes(search)
        );
    }

    filtered.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
    
    renderContas(filtered);
}

// ============================================
// RENDERIZAÇÃO COM INDICADOR DE SINCRONIZAÇÃO
// ============================================
function renderContas(lista) {
    const container = document.getElementById('contasContainer');
    
    if (!container) return;
    
    if (!lista || lista.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhuma conta encontrada para este período</div>';
        return;
    }

    const table = `
        <table>
            <thead>
                <tr>
                    <th style="text-align: center; width: 60px;"> </th>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th style="text-align: center;">Nº Parcelas</th>
                    <th>Banco</th>
                    <th>Data Pagamento</th>
                    <th>Status</th>
                    <th style="text-align: center;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(c => {
                    const numParcelas = c.parcela_numero && c.parcela_total 
                        ? `${c.parcela_numero}/${c.parcela_total}` 
                        : '-';
                    
                    // Indicador de sincronização
                    const syncIndicator = !c.synced && c.tempId 
                        ? '<span style="color: orange; font-size: 0.8em;" title="Sincronizando...">⟳</span> '
                        : '';
                    
                    return `
                    <tr class="${c.status === 'PAGO' ? 'row-pago' : ''}">
                        <td style="text-align: center;">
                            <button class="check-btn ${c.status === 'PAGO' ? 'checked' : ''}" 
                                    onclick="togglePago('${c.id || c.tempId}')" 
                                    title="${c.status === 'PAGO' ? 'Marcar como pendente' : 'Marcar como pago'}"
                                    ${!c.id ? 'disabled' : ''}>
                                    ✓
                            </button>
                        </td>
                        <td>${syncIndicator}${c.descricao}</td>
                        <td><strong>R$ ${parseFloat(c.valor).toFixed(2)}</strong></td>
                        <td>${formatDate(c.data_vencimento)}</td>
                        <td style="text-align: center;">${numParcelas}</td>
                        <td>${c.banco || '-'}</td>
                        <td>${c.data_pagamento ? formatDate(c.data_pagamento) : '-'}</td>
                        <td>${getStatusBadge(getStatusDinamico(c))}</td>
                        <td class="actions-cell" style="text-align: center;">
                            <button onclick="viewConta('${c.id || c.tempId}')" class="action-btn view" ${!c.id ? 'disabled' : ''}>Ver</button>
                            <button onclick="editConta('${c.id || c.tempId}')" class="action-btn edit" ${!c.id ? 'disabled' : ''}>Editar</button>
                            <button onclick="deleteConta('${c.id || c.tempId}')" class="action-btn delete" ${!c.id ? 'disabled' : ''}>Excluir</button>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// ============================================
// UTILITÁRIOS
// ============================================
function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
}

function getStatusDinamico(conta) {
    if (conta.status === 'PAGO') return 'PAGO';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVenc = new Date(conta.data_vencimento + 'T00:00:00');
    dataVenc.setHours(0, 0, 0, 0);
    if (dataVenc <= hoje) return 'VENCIDO';
    return 'PENDENTE';
}

function getStatusBadge(status) {
    const map = {
        'PAGO': { class: 'pago', text: 'Pago' },
        'VENCIDO': { class: 'vencido', text: 'Vencido' },
        'PENDENTE': { class: 'pendente', text: 'Pendente' }
    };
    const s = map[status] || { class: 'pendente', text: status };
    return `<span class="badge ${s.class}">${s.text}</span>`;
}

function showMessage(message, type) {
    const old = document.querySelectorAll('.floating-message');
    old.forEach(m => m.remove());
    
    const div = document.createElement('div');
    div.className = `floating-message ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    
    setTimeout(() => {
        div.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
