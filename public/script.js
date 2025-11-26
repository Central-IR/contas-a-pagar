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
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

console.log('CONTAS A PAGAR INICIADA - MODO OFFLINE HABILITADO');

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.getElementById('splashScreen').style.display = 'none';
        document.querySelector('.app-content').style.display = 'block';
    }, 1500);
    verificarAutenticacao();
});

// ============================================
// FORCE UPPERCASE
// ============================================
function forceUpperCase(element) {
    if (!element) return;
    element.addEventListener('input', (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.toUpperCase();
        e.target.setSelectionRange(start, end);
    });
}

// ============================================
// ARMAZENAMENTO LOCAL
// ============================================
function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(contas));
        console.log('DADOS SALVOS LOCALMENTE');
    } catch (error) {
        console.error('ERRO AO SALVAR NO LOCALSTORAGE:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            contas = JSON.parse(data);
            console.log(`${contas.length} CONTAS CARREGADAS DO ARMAZENAMENTO LOCAL`);
            updateAllFilters();
            updateDashboard();
            filterContas();
        }
    } catch (error) {
        console.error('ERRO AO CARREGAR DO LOCALSTORAGE:', error);
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
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">SOMENTE USUÁRIOS AUTENTICADOS PODEM ACESSAR ESTA ÁREA.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">IR PARA O PORTAL</a>
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
        const response = await fetch(`${API_URL}/contas`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('contasPagarSession');
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('SERVIDOR ONLINE - SINCRONIZANDO...');
            await syncWithServer();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        isOnline = false;
        updateConnectionStatus();
        console.log('MODO OFFLINE - DADOS SALVOS LOCALMENTE');
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
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('contasPagarSession');
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
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
            console.log(`SINCRONIZAÇÃO COMPLETA: ${contas.length} CONTAS`);
            updateAllFilters();
            updateDashboard();
            filterContas();
        }
    } catch (error) {
        console.error('ERRO AO SINCRONIZAR:', error);
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
        badgeAtraso.style.display = 'flex';
        badgeAtraso.textContent = vencido;
    } else {
        cardAtraso.classList.remove('has-alert');
        badgeAtraso.style.display = 'none';
    }
    
    const cardIminente = document.getElementById('cardIminente');
    const badgeIminente = document.getElementById('pulseBadgeIminente');
    
    if (iminente > 0) {
        cardIminente.classList.add('has-warning');
        badgeIminente.style.display = 'flex';
        badgeIminente.textContent = iminente;
    } else {
        cardIminente.classList.remove('has-warning');
        badgeIminente.style.display = 'none';
    }
}

// ============================================
// MODAL DE CONFIRMAÇÃO
// ============================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'CONFIRMAÇÃO', confirmText = 'CONFIRMAR', cancelText = 'CANCELAR', type = 'warning' } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal" style="z-index: 10001;">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p style="margin: 1.5rem 0; color: var(--text-primary); font-size: 1rem; line-height: 1.6;">${message}</p>
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
        // Buscar parcelas futuras do mesmo grupo
        const parcelasFuturas = contas.filter(c => 
            c.grupo_parcelas === conta.grupo_parcelas && 
            c.parcela_atual > conta.parcela_atual &&
            c.status !== 'PAGO'
        ).length;

        const modalHTML = `
            <div class="modal-overlay" id="parcelasModal" style="z-index: 10002;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3 class="modal-title">QUANTAS PARCELAS ESTÃO SENDO PAGAS?</h3>
                    </div>
                    <div style="margin: 1.5rem 0;">
                        <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                            ESTA É A ${conta.parcela_atual}ª PARCELA${parcelasFuturas > 0 ? ` (${parcelasFuturas} PARCELAS FUTURAS)` : ''}
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${conta.parcela_atual === 1 ? `
                                <button class="btn-opcao-parcela" data-opcao="APENAS_ESTA">
                                    APENAS ESTA PARCELA
                                </button>
                            ` : `
                                <button class="btn-opcao-parcela" data-opcao="APENAS_ESTA">
                                    APENAS ESTA PARCELA
                                </button>
                            `}
                            ${parcelasFuturas > 0 ? `
                                <button class="btn-opcao-parcela" data-opcao="TODAS">
                                    TODAS AS PARCELAS (${parcelasFuturas + 1} NO TOTAL)
                                </button>
                                ${parcelasFuturas > 1 ? `
                                    <button class="btn-opcao-parcela" data-opcao="CUSTOM">
                                        ESCOLHER QUANTIDADE
                                    </button>
                                ` : ''}
                            ` : ''}
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="secondary" id="cancelParcelasBtn">CANCELAR</button>
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
            options.push(`<option value="${i}">${i} PARCELAS</option>`);
        }

        const modalHTML = `
            <div class="modal-overlay" id="quantidadeModal" style="z-index: 10002;">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3 class="modal-title">QUANTAS PARCELAS?</h3>
                    </div>
                    <div style="margin: 1.5rem 0;">
                        <select id="selectQuantidade" class="form-control" style="width: 100%; padding: 10px;">
                            ${options.join('')}
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button class="secondary" id="cancelQtdBtn">CANCELAR</button>
                        <button class="success" id="confirmQtdBtn">CONFIRMAR</button>
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
            showMessage('CONTA NÃO ENCONTRADA!', 'error');
            return;
        }
    }

    // Gerar opções de parcelas
    const parcelasOptions = ['PARCELA_UNICA', '1_PARCELA', '2_PARCELA', '3_PARCELA', '4_PARCELA', '5_PARCELA', '6_PARCELA', '7_PARCELA', '8_PARCELA', '9_PARCELA', '10_PARCELA', '11_PARCELA', '12_PARCELA'];
    const parcelasHTML = parcelasOptions.map(p => {
        const label = p === 'PARCELA_UNICA' ? 'PARCELA ÚNICA' : p.replace('_', 'ª ');
        const selected = conta?.frequencia === p ? 'selected' : '';
        return `<option value="${p}" ${selected}>${label}</option>`;
    }).join('');

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'EDITAR CONTA' : 'NOVA CONTA'}</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchFormTab(0)">DADOS DA CONTA</button>
                        <button class="tab-btn" onclick="switchFormTab(1)">PAGAMENTO</button>
                    </div>

                    <form id="contaForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
                        <div class="tab-content active" id="tab-conta">
                            <div class="form-grid">
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="descricao">DESCRIÇÃO *</label>
                                    <input type="text" id="descricao" value="${conta?.descricao || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="valor">VALOR (R$) *</label>
                                    <input type="number" id="valor" step="0.01" min="0" value="${conta?.valor || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="data_vencimento">DATA DE VENCIMENTO *</label>
                                    <input type="date" id="data_vencimento" value="${conta?.data_vencimento || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="frequencia">PARCELAS *</label>
                                    <select id="frequencia" required>
                                        <option value="">SELECIONE...</option>
                                        ${parcelasHTML}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-pagamento">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="forma_pagamento">FORMA DE PAGAMENTO *</label>
                                    <select id="forma_pagamento" required>
                                        <option value="">SELECIONE...</option>
                                        <option value="PIX" ${conta?.forma_pagamento === 'PIX' ? 'selected' : ''}>PIX</option>
                                        <option value="BOLETO" ${conta?.forma_pagamento === 'BOLETO' ? 'selected' : ''}>BOLETO</option>
                                        <option value="TRANSFERENCIA" ${conta?.forma_pagamento === 'TRANSFERENCIA' ? 'selected' : ''}>TRANSFERÊNCIA</option>
                                        <option value="DEBITO" ${conta?.forma_pagamento === 'DEBITO' ? 'selected' : ''}>DÉBITO AUTOMÁTICO</option>
                                        <option value="CARTAO" ${conta?.forma_pagamento === 'CARTAO' ? 'selected' : ''}>CARTÃO</option>
                                        <option value="DINHEIRO" ${conta?.forma_pagamento === 'DINHEIRO' ? 'selected' : ''}>DINHEIRO</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="banco">BANCO *</label>
                                    <select id="banco" required>
                                        <option value="">SELECIONE...</option>
                                        <option value="BANCO DO BRASIL" ${conta?.banco === 'BANCO DO BRASIL' ? 'selected' : ''}>BANCO DO BRASIL</option>
                                        <option value="CAIXA" ${conta?.banco === 'CAIXA' ? 'selected' : ''}>CAIXA ECONÔMICA</option>
                                        <option value="BRADESCO" ${conta?.banco === 'BRADESCO' ? 'selected' : ''}>BRADESCO</option>
                                        <option value="ITAU" ${conta?.banco === 'ITAU' ? 'selected' : ''}>ITAÚ</option>
                                        <option value="SANTANDER" ${conta?.banco === 'SANTANDER' ? 'selected' : ''}>SANTANDER</option>
                                        <option value="SICOOB" ${conta?.banco === 'SICOOB' ? 'selected' : ''}>SICOOB</option>
                                    </select>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">OBSERVAÇÕES</label>
                                    <input type="text" id="observacoes" value="${conta?.observacoes || ''}" placeholder="EX: NOTA RECEBIDA, PENDENTE...">
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="submit" class="save">${isEditing ? 'ATUALIZAR' : 'SALVAR'}</button>
                            <button type="button" class="secondary" onclick="closeFormModal()">CANCELAR</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Forçar maiúsculas nos campos de texto
    forceUpperCase(document.getElementById('descricao'));
    forceUpperCase(document.getElementById('observacoes'));
    
    setTimeout(() => document.getElementById('descricao')?.focus(), 100);
}

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) {
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
        descricao: document.getElementById('descricao').value.trim().toUpperCase(),
        valor: parseFloat(document.getElementById('valor').value),
        data_vencimento: document.getElementById('data_vencimento').value,
        frequencia: document.getElementById('frequencia').value,
        forma_pagamento: document.getElementById('forma_pagamento').value,
        banco: document.getElementById('banco').value,
        observacoes: document.getElementById('observacoes').value.trim().toUpperCase(),
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
            showMessage('CONTA ATUALIZADA LOCALMENTE!', 'success');
        }
    } else {
        const novaConta = {
            ...formData,
            id: generateLocalId(),
            timestamp: new Date().toISOString()
        };
        contas.push(novaConta);
        saveToLocalStorage();
        showMessage('CONTA CRIADA LOCALMENTE!', 'success');
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
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(formData),
                mode: 'cors'
            });

            if (response.status === 401) {
                sessionStorage.removeItem('contasPagarSession');
                mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
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
                console.log('SINCRONIZADO COM SERVIDOR');
                updateAllFilters();
                updateDashboard();
                filterContas();
            }
        } catch (error) {
            console.log('ERRO AO SINCRONIZAR, MAS DADOS SALVOS LOCALMENTE:', error);
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
        // Desmarcar como pago
        conta.status = 'PENDENTE';
        conta.data_pagamento = null;
    } else {
        // Verificar se tem parcelas (grupo_parcelas)
        if (conta.grupo_parcelas) {
            const opcao = await showParcelasModal(conta);
            
            if (!opcao) {
                // Usuário cancelou
                return;
            }

            const hoje = new Date().toISOString().split('T')[0];
            conta.status = 'PAGO';
            conta.data_pagamento = hoje;

            // Sincronizar com servidor para processar parcelas
            if (isOnline) {
                try {
                    const response = await fetch(`${API_URL}/contas/${idStr}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Token': sessionToken,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ 
                            status: 'PAGO',
                            data_pagamento: hoje,
                            parcelas_pagas: opcao
                        }),
                        mode: 'cors'
                    });

                    if (response.ok) {
                        // Recarregar todas as contas para pegar as mudanças
                        await syncWithServer();
                        showMessage('PAGAMENTO REGISTRADO!', 'success');
                        return;
                    }
                } catch (error) {
                    console.log('ERRO AO SINCRONIZAR, MAS SALVO LOCALMENTE:', error);
                }
            }
        } else {
            // Conta única, sem parcelas
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
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    status: conta.status,
                    data_pagamento: conta.data_pagamento
                }),
                mode: 'cors'
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
            console.log('ERRO AO SINCRONIZAR STATUS, MAS SALVO LOCALMENTE:', error);
        }
    }
};

// Continuará no próximo arquivo com as demais funções...

// ============================================
// EDIÇÃO
// ============================================
window.editConta = function(id) {
    const idStr = String(id);
    const conta = contas.find(c => String(c.id) === idStr);
    
    if (!conta) {
        showMessage('CONTA NÃO ENCONTRADA!', 'error');
        return;
    }
    
    showFormModal(idStr);
};

// ============================================
// EXCLUSÃO
// ============================================
window.deleteConta = async function(id) {
    const confirmed = await showConfirm(
        'TEM CERTEZA QUE DESEJA EXCLUIR ESTA CONTA?',
        {
            title: 'EXCLUIR CONTA',
            confirmText: 'EXCLUIR',
            cancelText: 'CANCELAR',
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
    showMessage('CONTA EXCLUÍDA LOCALMENTE!', 'success');

    if (isOnline && !idStr.startsWith('local_')) {
        try {
            const response = await fetch(`${API_URL}/contas/${idStr}`, {
                method: 'DELETE',
                headers: {
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            if (response.ok) {
                console.log('CONTA EXCLUÍDA NO SERVIDOR');
            }
        } catch (error) {
            console.log('ERRO AO EXCLUIR NO SERVIDOR, MAS REMOVIDA LOCALMENTE:', error);
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
        showMessage('CONTA NÃO ENCONTRADA!', 'error');
        return;
    }

    const parcelaLabel = conta.frequencia === 'PARCELA_UNICA' ? 'PARCELA ÚNICA' : conta.frequencia.replace('_', 'ª ');

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">DETALHES DA CONTA</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab(0)">DADOS DA CONTA</button>
                        <button class="tab-btn" onclick="switchViewTab(1)">PAGAMENTO</button>
                    </div>

                    <div class="tab-content active" id="view-tab-conta">
                        <div class="info-section">
                            <h4>INFORMAÇÕES DA CONTA</h4>
                            <p><strong>DESCRIÇÃO:</strong> ${conta.descricao}</p>
                            <p><strong>VALOR:</strong> R$ ${parseFloat(conta.valor).toFixed(2)}</p>
                            <p><strong>DATA VENCIMENTO:</strong> ${formatDate(conta.data_vencimento)}</p>
                            <p><strong>PARCELA:</strong> ${parcelaLabel}</p>
                            ${conta.observacoes ? `<p><strong>OBSERVAÇÕES:</strong> ${conta.observacoes}</p>` : ''}
                            <p><strong>STATUS:</strong> ${getStatusBadge(conta.status)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-pagamento">
                        <div class="info-section">
                            <h4>INFORMAÇÕES DE PAGAMENTO</h4>
                            <p><strong>FORMA DE PAGAMENTO:</strong> ${conta.forma_pagamento}</p>
                            <p><strong>BANCO:</strong> ${conta.banco}</p>
                            ${conta.data_pagamento ? `<p><strong>DATA DO PAGAMENTO:</strong> ${formatDate(conta.data_pagamento)}</p>` : '<p><em>AINDA NÃO PAGO</em></p>'}
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="secondary" onclick="closeViewModal()">FECHAR</button>
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
// GERAÇÃO DE PDF - CONTAS PAGAS
// ============================================
window.generatePDFPagas = async function() {
    try {
        if (typeof window.jspdf === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            document.head.appendChild(script);
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const contasDoMes = contas.filter(c => {
            const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
            return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
        });

        const contasPagas = contasDoMes.filter(c => c.status === 'PAGO');

        if (contasPagas.length === 0) {
            showMessage('NÃO HÁ CONTAS PAGAS NESTE MÊS!', 'error');
            return;
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let yPos = 20;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO DE CONTAS A PAGAR', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 8;
        doc.setFontSize(12);
        doc.text('CONTAS PAGAS', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`MÊS: ${meses[currentMonth]} ${currentYear}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 5;
        doc.text(`GERADO EM: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 10;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        contasPagas.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));

        doc.setFontSize(8);
        const colWidths = [50, 24, 24, 28, 28, 26];
        const startX = margin;

        doc.setFont('helvetica', 'bold');
        doc.setFillColor(74, 74, 74);
        doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], 8, 'F');
        doc.setTextColor(255, 255, 255);
        
        let xPos = startX + 2;
        doc.text('DESCRICAO', xPos, yPos + 5);
        xPos += colWidths[0];
        doc.text('VENCIMENTO', xPos, yPos + 5);
        xPos += colWidths[1];
        doc.text('PAGAMENTO', xPos, yPos + 5);
        xPos += colWidths[2];
        doc.text('FORMA PGTO', xPos, yPos + 5);
        xPos += colWidths[3];
        doc.text('BANCO', xPos, yPos + 5);
        xPos += colWidths[4];
        doc.text('VALOR (R$)', xPos, yPos + 5);
        
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        let totalPago = 0;
        contasPagas.forEach((conta, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }

            const bgColor = index % 2 === 0 ? [245, 245, 245] : [255, 255, 255];
            
            const maxCharsPerLine = 22;
            const descricaoCompleta = conta.descricao;
            const descricaoLines = [];
            
            if (descricaoCompleta.length > maxCharsPerLine) {
                for (let i = 0; i < descricaoCompleta.length; i += maxCharsPerLine) {
                    descricaoLines.push(descricaoCompleta.substring(i, i + maxCharsPerLine));
                }
            } else {
                descricaoLines.push(descricaoCompleta);
            }
            
            const linesToShow = descricaoLines.slice(0, 2);
            const rowHeight = linesToShow.length > 1 ? 12 : 8;

            doc.setFillColor(...bgColor);
            doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], rowHeight, 'F');

            xPos = startX + 2;
            
            linesToShow.forEach((linha, idx) => {
                doc.text(linha, xPos, yPos + 5 + (idx * 4));
            });
            
            xPos += colWidths[0];
            doc.text(formatDate(conta.data_vencimento), xPos, yPos + 5);
            
            xPos += colWidths[1];
            doc.text(conta.data_pagamento ? formatDate(conta.data_pagamento) : '-', xPos, yPos + 5);
            
            xPos += colWidths[2];
            const formaPgto = conta.forma_pagamento.substring(0, 10);
            doc.text(formaPgto, xPos, yPos + 5);
            
            xPos += colWidths[3];
            const banco = conta.banco.substring(0, 11);
            doc.text(banco, xPos, yPos + 5);
            
            xPos += colWidths[4];
            doc.text(`R$ ${parseFloat(conta.valor).toFixed(2)}`, xPos, yPos + 5);

            totalPago += parseFloat(conta.valor);
            yPos += rowHeight;
        });

        yPos += 5;
        doc.setLineWidth(0.5);
        doc.setDrawColor(204, 112, 0);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('VALOR TOTAL:', startX, yPos);
        doc.text(`R$ ${totalPago.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, pageWidth - margin - 30, yPos);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        const footer = 'ESTE DOCUMENTO FOI GERADO AUTOMATICAMENTE PELO SISTEMA DE CONTAS A PAGAR';
        doc.text(footer, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        const fileName = `contas_pagas_${meses[currentMonth]}_${currentYear}.pdf`;
        doc.save(fileName);
        
        showMessage('PDF DE CONTAS PAGAS GERADO!', 'success');
    } catch (error) {
        console.error('ERRO AO GERAR PDF:', error);
        showMessage('ERRO AO GERAR PDF', 'error');
    }
};

// ============================================
// GERAÇÃO DE PDF - CONTAS NÃO PAGAS
// ============================================
window.generatePDFNaoPagas = async function() {
    try {
        if (typeof window.jspdf === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            document.head.appendChild(script);
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const contasDoMes = contas.filter(c => {
            const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
            return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
        });

        const contasNaoPagas = contasDoMes.filter(c => c.status !== 'PAGO');

        if (contasNaoPagas.length === 0) {
            showMessage('NÃO HÁ CONTAS PENDENTES NESTE MÊS!', 'success');
            return;
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let yPos = 20;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO DE CONTAS A PAGAR', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 8;
        doc.setFontSize(12);
        doc.text('CONTAS NÃO PAGAS', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`MÊS: ${meses[currentMonth]} ${currentYear}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 5;
        doc.text(`GERADO EM: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 10;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        contasNaoPagas.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));

        doc.setFontSize(8);
        const colWidths = [60, 26, 32, 32, 30];
        const startX = margin;

        doc.setFont('helvetica', 'bold');
        doc.setFillColor(74, 74, 74);
        doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], 8, 'F');
        doc.setTextColor(255, 255, 255);
        
        let xPos = startX + 2;
        doc.text('DESCRICAO', xPos, yPos + 5);
        xPos += colWidths[0];
        doc.text('VENCIMENTO', xPos, yPos + 5);
        xPos += colWidths[1];
        doc.text('FORMA PGTO', xPos, yPos + 5);
        xPos += colWidths[2];
        doc.text('BANCO', xPos, yPos + 5);
        xPos += colWidths[3];
        doc.text('VALOR (R$)', xPos, yPos + 5);
        
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        let totalPendente = 0;
        contasNaoPagas.forEach((conta, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }

            const bgColor = index % 2 === 0 ? [245, 245, 245] : [255, 255, 255];
            
            const maxCharsPerLine = 27;
            const descricaoCompleta = conta.descricao;
            const descricaoLines = [];
            
            if (descricaoCompleta.length > maxCharsPerLine) {
                for (let i = 0; i < descricaoCompleta.length; i += maxCharsPerLine) {
                    descricaoLines.push(descricaoCompleta.substring(i, i + maxCharsPerLine));
                }
            } else {
                descricaoLines.push(descricaoCompleta);
            }
            
            const linesToShow = descricaoLines.slice(0, 2);
            const rowHeight = linesToShow.length > 1 ? 12 : 8;

            doc.setFillColor(...bgColor);
            doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], rowHeight, 'F');

            xPos = startX + 2;
            
            linesToShow.forEach((linha, idx) => {
                doc.text(linha, xPos, yPos + 5 + (idx * 4));
            });
            
            xPos += colWidths[0];
            doc.text(formatDate(conta.data_vencimento), xPos, yPos + 5);
            
            xPos += colWidths[1];
            const formaPgto = conta.forma_pagamento.substring(0, 12);
            doc.text(formaPgto, xPos, yPos + 5);
            
            xPos += colWidths[2];
            const banco = conta.banco.substring(0, 13);
            doc.text(banco, xPos, yPos + 5);
            
            xPos += colWidths[3];
            doc.text(`R$ ${parseFloat(conta.valor).toFixed(2)}`, xPos, yPos + 5);

            totalPendente += parseFloat(conta.valor);
            yPos += rowHeight;
        });

        yPos += 5;
        doc.setLineWidth(0.5);
        doc.setDrawColor(204, 112, 0);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('VALOR TOTAL:', startX, yPos);
        doc.text(`R$ ${totalPendente.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, pageWidth - margin - 30, yPos);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        const footer = 'ESTE DOCUMENTO FOI GERADO AUTOMATICAMENTE PELO SISTEMA DE CONTAS A PAGAR';
        doc.text(footer, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        const fileName = `contas_nao_pagas_${meses[currentMonth]}_${currentYear}.pdf`;
        doc.save(fileName);
        
        showMessage('PDF DE CONTAS NÃO PAGAS GERADO!', 'success');
    } catch (error) {
        console.error('ERRO AO GERAR PDF:', error);
        showMessage('ERRO AO GERAR PDF', 'error');
    }
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
        select.innerHTML = '<option value="">TODOS</option>';
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
        select.innerHTML = '<option value="">TODOS</option>';
        
        if (statusSet.has('PAGO')) {
            const opt = document.createElement('option');
            opt.value = 'PAGO';
            opt.textContent = 'PAGO';
            select.appendChild(opt);
        }
        
        if (temVencido) {
            const opt = document.createElement('option');
            opt.value = 'VENCIDO';
            opt.textContent = 'VENCIDO';
            select.appendChild(opt);
        }
        
        if (temIminente) {
            const opt = document.createElement('option');
            opt.value = 'IMINENTE';
            opt.textContent = 'IMINENTE';
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
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">NENHUMA CONTA ENCONTRADA</div>';
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
                        <th>DESCRIÇÃO</th>
                        <th>VALOR</th>
                        <th>VENCIMENTO</th>
                        <th>BANCO</th>
                        <th>PARCELA</th>
                        <th>STATUS</th>
                        <th>DATA PAGAMENTO</th>
                        <th style="text-align: center;">AÇÕES</th>
                    </tr>
                </thead>
                <tbody>
                    ${contasToRender.map(c => {
                        const isPago = c.status === 'PAGO';
                        const dataPgto = c.data_pagamento ? formatDate(c.data_pagamento) : '-';
                        const parcelaLabel = c.frequencia === 'PARCELA_UNICA' ? 'ÚNICA' : c.frequencia.replace('_PARCELA', '');
                        
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
                                <button onclick="viewConta('${c.id}')" class="action-btn view" title="VER DETALHES">VER</button>
                                <button onclick="editConta('${c.id}')" class="action-btn edit" title="EDITAR">EDITAR</button>
                                <button onclick="deleteConta('${c.id}')" class="action-btn delete" title="EXCLUIR">EXCLUIR</button>
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
        'PAGO': { class: 'entregue', text: 'PAGO' },
        'VENCIDO': { class: 'devolvido', text: 'VENCIDO' },
        'IMINENTE': { class: 'rota', text: 'IMINENTE' },
        'PENDENTE': { class: 'transito', text: 'PENDENTE' }
    };
    
    const s = statusMap[status] || { class: 'transito', text: status };
    return `<span class="badge ${s.class}">${s.text}</span>`;
}

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
