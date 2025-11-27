// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';
const STORAGE_KEY = 'contasPagar_data';

let contas = [];
let isOnline = false;
let lastDataHash = '';
let sessionToken = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

console.log('🚀 Contas a Pagar iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ============================================
// ARMAZENAMENTO LOCAL
// ============================================
function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(contas));
        console.log('💾 Dados salvos localmente');
    } catch (error) {
        console.error('Erro ao salvar no localStorage:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            contas = JSON.parse(data);
            console.log(`📊 ${contas.length} contas carregadas do armazenamento local`);
            updateAllFilters();
            updateDashboard();
            filterContas();
        }
    } catch (error) {
        console.error('Erro ao carregar do localStorage:', error);
        contas = [];
    }
}

function generateLocalId() {
    return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

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
// AUTENTICAÇÃO
// ============================================
function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('contasPagarSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('contasPagarSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
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

function inicializarApp() {
    loadFromLocalStorage();
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/contas`, {
            method: 'HEAD',
            headers: { 'X-Session-Token': sessionToken },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('contasPagarSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ Servidor ONLINE');
            await syncWithServer();
        } else if (!wasOffline && !isOnline) {
            console.log('❌ Servidor OFFLINE');
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        if (isOnline) {
            console.log('❌ Erro de conexão:', error.message);
        }
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
// SINCRONIZAÇÃO
// ============================================
async function syncWithServer() {
    if (!isOnline) return;

    try {
        const response = await fetch(`${API_URL}/contas`, {
            headers: { 'X-Session-Token': sessionToken }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('contasPagarSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) return;

        const serverData = await response.json();
        const localOnlyData = contas.filter(c => String(c.id).startsWith('local_'));
        const mergedData = [...serverData, ...localOnlyData];
        
        contas = mergedData;
        saveToLocalStorage();
        
        const newHash = JSON.stringify(contas.map(c => c.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            console.log(`📊 ${contas.length} contas carregadas`);
            updateAllFilters();
            updateDashboard();
            filterContas();
        }
    } catch (error) {
        // Silencioso
    }
}

async function loadContas() {
    await syncWithServer();
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
    
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 15);
    
    const contasDoMes = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });
    
    const pagos = contasDoMes.filter(c => c.status === 'PAGO').length;
    
    const vencido = contasDoMes.filter(c => {
        if (c.status === 'PAGO') return false;
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        dataVenc.setHours(0, 0, 0, 0);
        return dataVenc <= hoje;
    }).length;
    
    const iminente = contasDoMes.filter(c => {
        if (c.status === 'PAGO') return false;
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        dataVenc.setHours(0, 0, 0, 0);
        return dataVenc > hoje && dataVenc <= quinzeDias;
    }).length;
    
    const valorTotal = contasDoMes.reduce((sum, c) => sum + parseFloat(c.valor || 0), 0);
    
    document.getElementById('statPagos').textContent = pagos;
    document.getElementById('statAtraso').textContent = vencido;
    document.getElementById('statIminente').textContent = iminente;
    document.getElementById('statValorTotal').textContent = `R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const cardAtraso = document.getElementById('cardAtraso');
    const badgeAtraso = document.getElementById('pulseBadgeAtraso');
    
    if (vencido > 0) {
        cardAtraso.classList.add('has-alert');
        if (badgeAtraso) {
            badgeAtraso.style.display = 'flex';
            badgeAtraso.textContent = vencido;
        }
    } else {
        cardAtraso.classList.remove('has-alert');
        if (badgeAtraso) {
            badgeAtraso.style.display = 'none';
        }
    }
    
    const cardIminente = document.getElementById('cardIminente');
    const badgeIminente = document.getElementById('pulseBadgeIminente');
    
    if (iminente > 0) {
        cardIminente.classList.add('has-warning');
        if (badgeIminente) {
            badgeIminente.style.display = 'flex';
            badgeIminente.textContent = iminente;
        }
    } else {
        cardIminente.classList.remove('has-warning');
        if (badgeIminente) {
            badgeIminente.style.display = 'none';
        }
    }
}

// ============================================
// MODAL DE CONFIRMAÇÃO
// ============================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p class="modal-message">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'success'}" id="modalConfirmBtn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('confirmModal');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { 
                modal.remove(); 
                resolve(result); 
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));

        if (!document.querySelector('#modalAnimations')) {
            const style = document.createElement('style');
            style.id = 'modalAnimations';
            style.textContent = `@keyframes fadeOut { to { opacity: 0; } }`;
            document.head.appendChild(style);
        }
    });
}

// ============================================
// MODAL DE SELEÇÃO DE PARCELAS
// ============================================
function showParcelasModal(conta) {
    return new Promise((resolve) => {
        const parcelasFuturas = contas.filter(c => 
            c.grupo_parcelas === conta.grupo_parcelas && 
            c.parcela_atual > conta.parcela_atual &&
            c.status !== 'PAGO'
        ).length;

        const modalHTML = `
            <div class="modal-overlay" id="parcelasModal" style="z-index: 10002;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Quantas Parcelas Estão Sendo Pagas?</h3>
                    </div>
                    <div style="margin: 1.5rem 0;">
                        <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                            Esta é a ${conta.parcela_atual}ª parcela${parcelasFuturas > 0 ? ` (${parcelasFuturas} parcelas futuras)` : ''}
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <button class="btn-opcao-parcela" data-opcao="APENAS_ESTA">
                                Apenas Esta Parcela
                            </button>
                            ${parcelasFuturas > 0 ? `
                                <button class="btn-opcao-parcela" data-opcao="TODAS">
                                    Todas as Parcelas (${parcelasFuturas + 1} no total)
                                </button>
                                ${parcelasFuturas > 1 ? `
                                    <button class="btn-opcao-parcela" data-opcao="CUSTOM">
                                        Escolher Quantidade
                                    </button>
                                ` : ''}
                            ` : ''}
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="secondary" id="cancelParcelasBtn">Cancelar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('parcelasModal');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { 
                modal.remove(); 
                resolve(result); 
            }, 200);
        };

        document.querySelectorAll('.btn-opcao-parcela').forEach(btn => {
            btn.addEventListener('click', async () => {
                const opcao = btn.dataset.opcao;
                
                if (opcao === 'CUSTOM') {
                    modal.remove();
                    const qtd = await showQuantidadeModal(parcelasFuturas);
                    resolve(qtd);
                } else {
                    closeModal(opcao);
                }
            });
        });

        document.getElementById('cancelParcelasBtn').addEventListener('click', () => closeModal(null));
    });
}

function showQuantidadeModal(maxParcelas) {
    return new Promise((resolve) => {
        const options = [];
        for (let i = 2; i <= maxParcelas + 1; i++) {
            options.push(`<option value="${i}">${i} Parcelas</option>`);
        }

        const modalHTML = `
            <div class="modal-overlay" id="quantidadeModal" style="z-index: 10002;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Quantas Parcelas?</h3>
                    </div>
                    <div style="margin: 1.5rem 0;">
                        <select id="selectQuantidade" style="width: 100%; padding: 10px; background: var(--input-bg); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px;">
                            ${options.join('')}
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button class="secondary" id="cancelQtdBtn">Cancelar</button>
                        <button class="success" id="confirmQtdBtn">Confirmar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('quantidadeModal');
        const select = document.getElementById('selectQuantidade');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { 
                modal.remove(); 
                resolve(result); 
            }, 200);
        };

        document.getElementById('confirmQtdBtn').addEventListener('click', () => {
            closeModal(select.value);
        });

        document.getElementById('cancelQtdBtn').addEventListener('click', () => closeModal(null));
    });
}

// ============================================
// FORMULÁRIO
// ============================================
window.toggleForm = function() {
    showFormModal(null);
};

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    let conta = null;
    
    if (isEditing) {
        const idStr = String(editingId);
        conta = contas.find(c => String(c.id) === idStr);
        
        if (!conta) {
            showMessage('Conta não encontrada!', 'error');
            return;
        }
    }

    const parcelasOptions = ['PARCELA_UNICA', '1_PARCELA', '2_PARCELA', '3_PARCELA', '4_PARCELA', '5_PARCELA', '6_PARCELA', '7_PARCELA', '8_PARCELA', '9_PARCELA', '10_PARCELA', '11_PARCELA', '12_PARCELA'];
    const parcelasHTML = parcelasOptions.map(p => {
        const label = p === 'PARCELA_UNICA' ? 'Parcela Única' : p.replace('_PARCELA', 'ª Parcela');
        const selected = conta?.frequencia === p ? 'selected' : '';
        return `<option value="${p}" ${selected}>${label}</option>`;
    }).join('');

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Conta' : 'Nova Conta'}</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchFormTab(0)">Dados da Conta</button>
                        <button class="tab-btn" onclick="switchFormTab(1)">Pagamento</button>
                    </div>

                    <form id="contaForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
                        <div class="tab-content active" id="tab-conta">
                            <div class="form-grid">
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="descricao">Descrição *</label>
                                    <input type="text" id="descricao" value="${conta?.descricao || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="valor">Valor (R$) *</label>
                                    <input type="number" id="valor" step="0.01" min="0" value="${conta?.valor || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="data_vencimento">Data de Vencimento *</label>
                                    <input type="date" id="data_vencimento" value="${conta?.data_vencimento || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="frequencia">Parcelas *</label>
                                    <select id="frequencia" required>
                                        <option value="">Selecione...</option>
                                        ${parcelasHTML}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-pagamento">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="forma_pagamento">Forma de Pagamento *</label>
                                    <select id="forma_pagamento" required>
                                        <option value="">Selecione...</option>
                                        <option value="PIX" ${conta?.forma_pagamento === 'PIX' ? 'selected' : ''}>PIX</option>
                                        <option value="BOLETO" ${conta?.forma_pagamento === 'BOLETO' ? 'selected' : ''}>Boleto</option>
                                        <option value="TRANSFERENCIA" ${conta?.forma_pagamento === 'TRANSFERENCIA' ? 'selected' : ''}>Transferência</option>
                                        <option value="DEBITO" ${conta?.forma_pagamento === 'DEBITO' ? 'selected' : ''}>Débito Automático</option>
                                        <option value="CARTAO" ${conta?.forma_pagamento === 'CARTAO' ? 'selected' : ''}>Cartão</option>
                                        <option value="DINHEIRO" ${conta?.forma_pagamento === 'DINHEIRO' ? 'selected' : ''}>Dinheiro</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="banco">Banco *</label>
                                    <select id="banco" required>
                                        <option value="">Selecione...</option>
                                        <option value="BANCO DO BRASIL" ${conta?.banco === 'BANCO DO BRASIL' ? 'selected' : ''}>Banco do Brasil</option>
                                        <option value="CAIXA" ${conta?.banco === 'CAIXA' ? 'selected' : ''}>Caixa Econômica</option>
                                        <option value="BRADESCO" ${conta?.banco === 'BRADESCO' ? 'selected' : ''}>Bradesco</option>
                                        <option value="ITAU" ${conta?.banco === 'ITAU' ? 'selected' : ''}>Itaú</option>
                                        <option value="SANTANDER" ${conta?.banco === 'SANTANDER' ? 'selected' : ''}>Santander</option>
                                        <option value="SICOOB" ${conta?.banco === 'SICOOB' ? 'selected' : ''}>Sicoob</option>
                                    </select>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">Observações</label>
                                    <input type="text" id="observacoes" value="${conta?.observacoes || ''}" placeholder="Ex: Nota recebida, pendente...">
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary" onclick="closeFormModal(true)">Cancelar</button>
                            <button type="submit" class="save">${isEditing ? 'Atualizar' : 'Salvar'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setTimeout(() => document.getElementById('descricao')?.focus(), 100);
}

function closeFormModal(showCancelMessage = false) {
    const modal = document.getElementById('formModal');
    if (modal) {
        const editId = document.getElementById('editId')?.value;
        const isEditing = editId && editId !== '';
        
        if (showCancelMessage) {
            showMessage(isEditing ? 'Atualização cancelada' : 'Registro cancelado', 'error');
        }
        
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================
// SISTEMA DE ABAS
// ============================================
window.switchFormTab = function(index) {
    const tabButtons = document.querySelectorAll('#formModal .tab-btn');
    const tabContents = document.querySelectorAll('#formModal .tab-content');
    
    tabButtons.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    tabContents.forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

// ============================================
// SUBMIT
// ============================================
async function handleSubmit(event) {
    if (event) event.preventDefault();

    const formData = {
        descricao: document.getElementById('descricao').value.trim(),
        valor: parseFloat(document.getElementById('valor').value),
        data_vencimento: document.getElementById('data_vencimento').value,
        frequencia: document.getElementById('frequencia').value,
        forma_pagamento: document.getElementById('forma_pagamento').value,
        banco: document.getElementById('banco').value,
        observacoes: document.getElementById('observacoes').value.trim(),
        status: 'PENDENTE',
        data_pagamento: null
    };

    const editId = document.getElementById('editId').value;

    if (editId) {
        const contaExistente = contas.find(c => String(c.id) === String(editId));
        if (contaExistente) {
            formData.status = contaExistente.status;
            formData.data_pagamento = contaExistente.data_pagamento;
            formData.timestamp = contaExistente.timestamp;
        }
    }

    if (editId) {
        const index = contas.findIndex(c => String(c.id) === String(editId));
        if (index !== -1) {
            contas[index] = { ...contas[index], ...formData };
            saveToLocalStorage();
            showMessage('Atualizado!', 'success');
        }
    } else {
        const novaConta = {
            ...formData,
            id: generateLocalId(),
            timestamp: new Date().toISOString()
        };
        contas.push(novaConta);
        saveToLocalStorage();
        showMessage('Criado!', 'success');
    }

    updateAllFilters();
    updateDashboard();
    filterContas();
    closeFormModal();

    if (isOnline) {
        try {
            const url = editId ? `${API_URL}/contas/${editId}` : `${API_URL}/contas`;
            const method = editId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify(formData)
            });

            if (response.status === 401) {
                sessionStorage.removeItem('contasPagarSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (response.ok) {
                const savedData = await response.json();
                
                if (editId) {
                    const index = contas.findIndex(c => String(c.id) === String(editId));
                    if (index !== -1) contas[index] = savedData;
                } else {
                    contas = contas.filter(c => !String(c.id).startsWith('local_'));
                    contas.push(savedData);
                }
                
                saveToLocalStorage();
                updateAllFilters();
                updateDashboard();
                filterContas();
            }
        } catch (error) {
            console.log('Erro ao sincronizar, mas dados salvos localmente');
        }
    }
}

// ============================================
// TOGGLE PAGO
// ============================================
window.togglePago = async function(id) {
    const idStr = String(id);
    const conta = contas.find(c => String(c.id) === idStr);
    
    if (!conta) return;

    if (conta.status === 'PAGO') {
        conta.status = 'PENDENTE';
        conta.data_pagamento = null;
    } else {
        if (conta.grupo_parcelas) {
            const opcao = await showParcelasModal(conta);
            
            if (!opcao) return;

            const hoje = new Date().toISOString().split('T')[0];
            conta.status = 'PAGO';
            conta.data_pagamento = hoje;

            if (isOnline) {
                try {
                    const response = await fetch(`${API_URL}/contas/${idStr}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Token': sessionToken
                        },
                        body: JSON.stringify({ 
                            status: 'PAGO',
                            data_pagamento: hoje,
                            parcelas_pagas: opcao
                        })
                    });

                    if (response.ok) {
                        await syncWithServer();
                        showMessage('Pagamento registrado!', 'success');
                        return;
                    }
                } catch (error) {
                    console.log('Erro ao sincronizar, mas salvo localmente');
                }
            }
        } else {
            const hoje = new Date().toISOString().split('T')[0];
            conta.status = 'PAGO';
            conta.data_pagamento = hoje;
        }
    }

    saveToLocalStorage();
    updateDashboard();
    filterContas();

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/contas/${idStr}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify({ 
                    status: conta.status,
                    data_pagamento: conta.data_pagamento
                })
            });

            if (response.ok) {
                const savedData = await response.json();
                const index = contas.findIndex(c => String(c.id) === idStr);
                if (index !== -1) {
                    contas[index] = savedData;
                    saveToLocalStorage();
                    filterContas();
                }
            }
        } catch (error) {
            console.log('Erro ao sincronizar status, mas salvo localmente');
        }
    }
};

// ============================================
// EDIÇÃO
// ============================================
window.editConta = function(id) {
    const idStr = String(id);
    const conta = contas.find(c => String(c.id) === idStr);
    
    if (!conta) {
        showMessage('Conta não encontrada!', 'error');
        return;
    }
    
    showFormModal(idStr);
};

// ============================================
// EXCLUSÃO
// ============================================
window.deleteConta = async function(id) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir esta conta?',
        {
            title: 'Excluir Conta',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

    if (!confirmed) return;

    const idStr = String(id);
    contas = contas.filter(c => String(c.id) !== idStr);
    
    saveToLocalStorage();
    updateAllFilters();
    updateDashboard();
    filterContas();
    showMessage('Excluído!', 'error');

    if (isOnline && !idStr.startsWith('local_')) {
        try {
            const response = await fetch(`${API_URL}/contas/${idStr}`, {
                method: 'DELETE',
                headers: { 'X-Session-Token': sessionToken }
            });

            if (response.ok) {
                console.log('Conta excluída no servidor');
            }
        } catch (error) {
            console.log('Erro ao excluir no servidor, mas removida localmente');
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

    const parcelaLabel = conta.frequencia === 'PARCELA_UNICA' ? 'Parcela Única' : conta.frequencia.replace('_PARCELA', 'ª Parcela');

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Conta</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab(0)">Dados da Conta</button>
                        <button class="tab-btn" onclick="switchViewTab(1)">Pagamento</button>
                    </div>

                    <div class="tab-content active" id="view-tab-conta">
                        <div class="info-section">
                            <h4>Informações da Conta</h4>
                            <p><strong>Descrição:</strong> ${conta.descricao}</p>
                            <p><strong>Valor:</strong> R$ ${parseFloat(conta.valor).toFixed(2)}</p>
                            <p><strong>Data Vencimento:</strong> ${formatDate(conta.data_vencimento)}</p>
                            <p><strong>Parcela:</strong> ${parcelaLabel}</p>
                            ${conta.observacoes ? `<p><strong>Observações:</strong> ${conta.observacoes}</p>` : ''}
                            <p><strong>Status:</strong> ${getStatusBadge(conta.status)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-pagamento">
                        <div class="info-section">
                            <h4>Informações de Pagamento</h4>
                            <p><strong>Forma de Pagamento:</strong> ${conta.forma_pagamento}</p>
                            <p><strong>Banco:</strong> ${conta.banco}</p>
                            ${conta.data_pagamento ? `<p><strong>Data do Pagamento:</strong> ${formatDate(conta.data_pagamento)}</p>` : '<p><em>Ainda não pago</em></p>'}
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="secondary" onclick="closeViewModal()">Fechar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

window.switchViewTab = function(index) {
    document.querySelectorAll('#viewModal .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    document.querySelectorAll('#viewModal .tab-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

// ============================================
// FILTROS
// ============================================
function updateAllFilters() {
    updateBancosFilter();
    updateStatusFilter();
}

function updateBancosFilter() {
    const contasDoMes = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });

    const bancos = new Set();
    contasDoMes.forEach(c => {
        if (c.banco?.trim()) {
            bancos.add(c.banco.trim());
        }
    });

    const select = document.getElementById('filterBanco');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos</option>';
        Array.from(bancos).sort().forEach(b => {
            const option = document.createElement('option');
            option.value = b;
            option.textContent = b;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

function updateStatusFilter() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const contasDoMes = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });
    
    const statusSet = new Set();
    let temVencido = false;
    let temIminente = false;
    
    contasDoMes.forEach(c => {
        if (c.status === 'PAGO') {
            statusSet.add('PAGO');
        } else {
            const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
            dataVenc.setHours(0, 0, 0, 0);
            
            if (dataVenc <= hoje) {
                temVencido = true;
            } else {
                const quinzeDias = new Date(hoje);
                quinzeDias.setDate(quinzeDias.getDate() + 15);
                if (dataVenc <= quinzeDias) {
                    temIminente = true;
                }
            }
        }
    });

    const select = document.getElementById('filterStatus');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos</option>';
        
        if (statusSet.has('PAGO')) {
            const opt = document.createElement('option');
            opt.value = 'PAGO';
            opt.textContent = 'Pago';
            select.appendChild(opt);
        }
        
        if (temVencido) {
            const opt = document.createElement('option');
            opt.value = 'VENCIDO';
            opt.textContent = 'Vencido';
            select.appendChild(opt);
        }
        
        if (temIminente) {
            const opt = document.createElement('option');
            opt.value = 'IMINENTE';
            opt.textContent = 'Iminente';
            select.appendChild(opt);
        }
        
        select.value = currentValue;
    }
}

function filterContas() {
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const filterBanco = document.getElementById('filterBanco')?.value || '';
    const filterStatus = document.getElementById('filterStatus')?.value || '';
    const filterFrequencia = document.getElementById('filterFrequencia')?.value || '';
    
    let filtered = [...contas];

    filtered = filtered.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });

    if (filterBanco) {
        filtered = filtered.filter(c => c.banco === filterBanco);
    }

    if (filterStatus) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const quinzeDias = new Date(hoje);
        quinzeDias.setDate(quinzeDias.getDate() + 15);
        
        filtered = filtered.filter(c => {
            if (filterStatus === 'PAGO') {
                return c.status === 'PAGO';
            }
            if (filterStatus === 'VENCIDO') {
                if (c.status === 'PAGO') return false;
                const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
                dataVenc.setHours(0, 0, 0, 0);
                return dataVenc <= hoje;
            }
            if (filterStatus === 'IMINENTE') {
                if (c.status === 'PAGO') return false;
                const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
                dataVenc.setHours(0, 0, 0, 0);
                return dataVenc > hoje && dataVenc <= quinzeDias;
            }
            return true;
        });
    }

    if (filterFrequencia) {
        filtered = filtered.filter(c => c.frequencia === filterFrequencia);
    }

    if (searchTerm) {
        filtered = filtered.filter(c => 
            c.descricao?.toLowerCase().includes(searchTerm) ||
            c.banco?.toLowerCase().includes(searchTerm) ||
            c.forma_pagamento?.toLowerCase().includes(searchTerm)
        );
    }

    filtered.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
    renderContas(filtered);
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderContas(contasToRender) {
    const container = document.getElementById('contasContainer');
    
    if (!container) return;
    
    if (!contasToRender || contasToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma conta encontrada</div>';
        return;
    }

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">
                            <span style="font-size: 1.1rem;">✓</span>
                        </th>
                        <th>Descrição</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Banco</th>
                        <th>Parcela</th>
                        <th>Status</th>
                        <th>Data Pagamento</th>
                        <th style="text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${contasToRender.map(c => {
                        const isPago = c.status === 'PAGO';
                        const dataPgto = c.data_pagamento ? formatDate(c.data_pagamento) : '-';
                        const parcelaLabel = c.frequencia === 'PARCELA_UNICA' ? 'Única' : c.frequencia.replace('_PARCELA', '');
                        
                        return `
                        <tr class="${isPago ? 'row-pago' : ''}">
                            <td style="text-align: center; padding: 8px;">
                                <div class="checkbox-wrapper">
                                    <input 
                                        type="checkbox" 
                                        id="check-${c.id}"
                                        ${isPago ? 'checked' : ''}
                                        onchange="togglePago('${c.id}')"
                                        class="styled-checkbox"
                                    >
                                    <label for="check-${c.id}" class="checkbox-label-styled"></label>
                                </div>
                            </td>
                            <td>${c.descricao}</td>
                            <td><strong>R$ ${parseFloat(c.valor).toFixed(2)}</strong></td>
                            <td style="white-space: nowrap;">${formatDate(c.data_vencimento)}</td>
                            <td>${c.banco}</td>
                            <td>${parcelaLabel}</td>
                            <td>${getStatusBadge(getStatusDinamico(c))}</td>
                            <td style="white-space: nowrap;"><strong>${dataPgto}</strong></td>
                            <td class="actions-cell" style="text-align: center; white-space: nowrap;">
                                <button onclick="viewConta('${c.id}')" class="action-btn view" title="Ver detalhes">Ver</button>
                                <button onclick="editConta('${c.id}')" class="action-btn edit" title="Editar">Editar</button>
                                <button onclick="deleteConta('${c.id}')" class="action-btn delete" title="Excluir">Excluir</button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
}

// ============================================
// UTILIDADES
// ============================================
function formatDate(dateString) {
    if (!dateString) return '-';
    
    if (dateString.includes('T')) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }
    
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function getStatusDinamico(conta) {
    if (conta.status === 'PAGO') return 'PAGO';
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVenc = new Date(conta.data_vencimento + 'T00:00:00');
    dataVenc.setHours(0, 0, 0, 0);
    
    if (dataVenc <= hoje) return 'VENCIDO';
    
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 15);
    
    if (dataVenc <= quinzeDias) return 'IMINENTE';
    
    return 'PENDENTE';
}

function getStatusBadge(status) {
    const statusMap = {
        'PAGO': { class: 'entregue', text: 'Pago' },
        'VENCIDO': { class: 'devolvido', text: 'Vencido' },
        'IMINENTE': { class: 'rota', text: 'Iminente' },
        'PENDENTE': { class: 'transito', text: 'Pendente' }
    };
    
    const s = statusMap[status] || { class: 'transito', text: status };
    return `<span class="badge ${s.class}">${s.text}</span>`;
}

// ============================================
// MENSAGENS
// ============================================
function showMessage(message, type) {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}
