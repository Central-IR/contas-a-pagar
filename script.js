// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://contas-pagar.onrender.com/api';
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

console.log('Contas a Pagar iniciada - Modo Offline Habilitado');

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.getElementById('splashScreen').style.display = 'none';
        document.querySelector('.app-content').style.display = 'block';
    }, 1500);
    verificarAutenticacao();
});

// ============================================
// ARMAZENAMENTO LOCAL
// ============================================
function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(contas));
        console.log('Dados salvos localmente');
    } catch (error) {
        console.error('Erro ao salvar no localStorage:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            contas = JSON.parse(data);
            console.log(`${contas.length} contas carregadas do armazenamento local`);
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
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('Servidor ONLINE - Sincronizando...');
            await syncWithServer();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        isOnline = false;
        updateConnectionStatus();
        console.log('Modo Offline - Dados salvos localmente');
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
            console.log(`Sincronização completa: ${contas.length} contas`);
            updateAllFilters();
            updateDashboard();
            filterContas();
        }
    } catch (error) {
        console.error('Erro ao sincronizar:', error);
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
    
    // VENCIDO = vence hoje OU já passou (<=)
    const vencido = contasDoMes.filter(c => {
        if (c.status === 'PAGO') return false;
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        dataVenc.setHours(0, 0, 0, 0);
        return dataVenc <= hoje;
    }).length;
    
    const eminente = contasDoMes.filter(c => {
        if (c.status === 'PAGO') return false;
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        dataVenc.setHours(0, 0, 0, 0);
        return dataVenc > hoje && dataVenc <= quinzeDias;
    }).length;
    
    const valorTotal = contasDoMes.reduce((sum, c) => sum + parseFloat(c.valor || 0), 0);
    
    document.getElementById('statPagos').textContent = pagos;
    document.getElementById('statAtraso').textContent = vencido;
    document.getElementById('statEminente').textContent = eminente;
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
    
    const cardEminente = document.getElementById('cardEminente');
    const badgeEminente = document.getElementById('pulseBadgeEminente');
    
    if (eminente > 0) {
        cardEminente.classList.add('has-warning');
        badgeEminente.style.display = 'flex';
        badgeEminente.textContent = eminente;
    } else {
        cardEminente.classList.remove('has-warning');
        badgeEminente.style.display = 'none';
    }
}

// ============================================
// MODAL DE CONFIRMAÇÃO
// ============================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

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

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content">
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
                                    <label for="frequencia">Frequência *</label>
                                    <select id="frequencia" required>
                                        <option value="">Selecione...</option>
                                        <option value="MENSAL" ${conta?.frequencia === 'MENSAL' ? 'selected' : ''}>Mensal</option>
                                        <option value="ANUAL" ${conta?.frequencia === 'ANUAL' ? 'selected' : ''}>Anual</option>
                                        <option value="UNICA" ${conta?.frequencia === 'UNICA' ? 'selected' : ''}>Única</option>
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
                                    <label for="status_nota">Status da Nota</label>
                                    <input type="text" id="status_nota" value="${conta?.status_nota || ''}" placeholder="Ex: Recebida, Pendente...">
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="submit" class="save">${isEditing ? 'Atualizar' : 'Salvar'}</button>
                            <button type="button" class="secondary" onclick="closeFormModal()">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const camposMaiusculas = ['descricao', 'status_nota'];
    camposMaiusculas.forEach(campoId => {
        const campo = document.getElementById(campoId);
        if (campo) {
            campo.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(start, start);
            });
        }
    });
    
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
        descricao: document.getElementById('descricao').value.trim(),
        valor: parseFloat(document.getElementById('valor').value),
        data_vencimento: document.getElementById('data_vencimento').value,
        frequencia: document.getElementById('frequencia').value,
        forma_pagamento: document.getElementById('forma_pagamento').value,
        banco: document.getElementById('banco').value,
        status_nota: document.getElementById('status_nota').value.trim(),
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
            showMessage('Conta atualizada localmente!', 'success');
        }
    } else {
        const novaConta = {
            ...formData,
            id: generateLocalId(),
            timestamp: new Date().toISOString()
        };
        contas.push(novaConta);
        saveToLocalStorage();
        showMessage('Conta criada localmente!', 'success');
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
                console.log('Sincronizado com servidor');
                updateAllFilters();
                updateDashboard();
                filterContas();
            }
        } catch (error) {
            console.log('Erro ao sincronizar, mas dados salvos localmente:', error);
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
        const hoje = new Date().toISOString().split('T')[0];
        conta.status = 'PAGO';
        conta.data_pagamento = hoje;
        console.log('Conta marcada como paga:', { id: conta.id, data_pagamento: conta.data_pagamento });
    }

    saveToLocalStorage();
    updateDashboard();
    filterContas(); // Isso já chama renderContas()

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
                    filterContas(); // Atualiza a tabela com dados do servidor
                }
            }
        } catch (error) {
            console.log('Erro ao sincronizar status, mas salvo localmente:', error);
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
    const deletedConta = contas.find(c => String(c.id) === idStr);
    contas = contas.filter(c => String(c.id) !== idStr);
    
    saveToLocalStorage();
    updateAllFilters();
    updateDashboard();
    filterContas();
    showMessage('Conta excluída localmente!', 'success');

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
                console.log('Conta excluída no servidor');
            }
        } catch (error) {
            console.log('Erro ao excluir no servidor, mas removida localmente:', error);
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

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content">
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
                            <p><strong>Frequência:</strong> ${getFrequenciaText(conta.frequencia)}</p>
                            ${conta.status_nota ? `<p><strong>Status da Nota:</strong> ${conta.status_nota}</p>` : ''}
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
// GERAÇÃO DE PDF - CONTAS PAGAS (CINZA)
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
            showMessage('Não há contas pagas neste mês!', 'error');
            return;
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let yPos = 20;

        // Cabeçalho
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO DE CONTAS A PAGAR', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 8;
        doc.setFontSize(12);
        doc.text('CONTAS PAGAS', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Mês: ${meses[currentMonth]} ${currentYear}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 5;
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 10;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        // Tabela de contas
        contasPagas.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));

        doc.setFontSize(9);
        const colWidths = [65, 25, 30, 35, 25];
        const startX = margin;

        // Cabeçalho da tabela - CINZA
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(74, 74, 74); // Cinza escuro
        doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], 8, 'F');
        doc.setTextColor(255, 255, 255);
        
        let xPos = startX + 2;
        doc.text('DESCRIÇÃO', xPos, yPos + 5);
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

        // Dados das contas
        let totalPago = 0;
        contasPagas.forEach((conta, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }

            const bgColor = index % 2 === 0 ? [245, 245, 245] : [255, 255, 255];
            doc.setFillColor(...bgColor);
            doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], 8, 'F');

            xPos = startX + 2;
            doc.text(conta.descricao.substring(0, 30), xPos, yPos + 5);
            xPos += colWidths[0];
            doc.text(formatDate(conta.data_vencimento), xPos, yPos + 5);
            xPos += colWidths[1];
            doc.text(conta.forma_pagamento.substring(0, 12), xPos, yPos + 5);
            xPos += colWidths[2];
            doc.text(conta.banco.substring(0, 15), xPos, yPos + 5);
            xPos += colWidths[3];
            doc.text(`R$ ${parseFloat(conta.valor).toFixed(2)}`, xPos, yPos + 5);

            totalPago += parseFloat(conta.valor);
            yPos += 8;
        });

        // Total
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

        // Rodapé
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        const footer = 'Este documento foi gerado automaticamente pelo Sistema de Contas a Pagar';
        doc.text(footer, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        const fileName = `contas_pagas_${meses[currentMonth]}_${currentYear}.pdf`;
        doc.save(fileName);
        
        showMessage('PDF de contas pagas gerado!', 'success');
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        showMessage('Erro ao gerar PDF', 'error');
    }
};

// ============================================
// GERAÇÃO DE PDF - CONTAS NÃO PAGAS (CINZA)
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
            showMessage('Não há contas pendentes neste mês!', 'success');
            return;
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let yPos = 20;

        // Cabeçalho
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO DE CONTAS A PAGAR', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 8;
        doc.setFontSize(12);
        doc.text('CONTAS NÃO PAGAS', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Mês: ${meses[currentMonth]} ${currentYear}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 5;
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 10;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        // Tabela de contas
        contasNaoPagas.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));

        doc.setFontSize(9);
        const colWidths = [65, 25, 30, 35, 25];
        const startX = margin;

        // Cabeçalho da tabela - CINZA
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(74, 74, 74); // Cinza escuro
        doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], 8, 'F');
        doc.setTextColor(255, 255, 255);
        
        let xPos = startX + 2;
        doc.text('DESCRIÇÃO', xPos, yPos + 5);
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

        // Dados das contas
        let totalPendente = 0;
        contasNaoPagas.forEach((conta, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }

            const bgColor = index % 2 === 0 ? [245, 245, 245] : [255, 255, 255];
            doc.setFillColor(...bgColor);
            doc.rect(startX, yPos, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], 8, 'F');

            xPos = startX + 2;
            doc.text(conta.descricao.substring(0, 30), xPos, yPos + 5);
            xPos += colWidths[0];
            doc.text(formatDate(conta.data_vencimento), xPos, yPos + 5);
            xPos += colWidths[1];
            doc.text(conta.forma_pagamento.substring(0, 12), xPos, yPos + 5);
            xPos += colWidths[2];
            doc.text(conta.banco.substring(0, 15), xPos, yPos + 5);
            xPos += colWidths[3];
            doc.text(`R$ ${parseFloat(conta.valor).toFixed(2)}`, xPos, yPos + 5);

            totalPendente += parseFloat(conta.valor);
            yPos += 8;
        });

        // Total
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

        // Rodapé
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        const footer = 'Este documento foi gerado automaticamente pelo Sistema de Contas a Pagar';
        doc.text(footer, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        const fileName = `contas_nao_pagas_${meses[currentMonth]}_${currentYear}.pdf`;
        doc.save(fileName);
        
        showMessage('PDF de contas não pagas gerado!', 'success');
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        showMessage('Erro ao gerar PDF', 'error');
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
    let temEminente = false;
    
    contasDoMes.forEach(c => {
        if (c.status === 'PAGO') {
            statusSet.add('PAGO');
        } else {
            const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
            dataVenc.setHours(0, 0, 0, 0);
            
            // VENCIDO = vence hoje OU já passou (<=)
            if (dataVenc <= hoje) {
                temVencido = true;
            } else {
                const quinzeDias = new Date(hoje);
                quinzeDias.setDate(quinzeDias.getDate() + 15);
                if (dataVenc <= quinzeDias) {
                    temEminente = true;
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
        
        if (temEminente) {
            const opt = document.createElement('option');
            opt.value = 'EMINENTE';
            opt.textContent = 'Eminente';
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
            if (filterStatus === 'EMINENTE') {
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
// RENDERIZAÇÃO - TABELA SIMPLIFICADA
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
                        <th>Status</th>
                        <th>Data Pagamento</th>
                        <th style="text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${contasToRender.map(c => {
                        const isPago = c.status === 'PAGO';
                        const dataPgto = c.data_pagamento ? formatDate(c.data_pagamento) : '-';
                        
                        // Debug: log apenas para contas pagas
                        if (isPago && c.data_pagamento) {
                            console.log('Renderizando conta paga:', { 
                                id: c.id, 
                                descricao: c.descricao, 
                                data_pagamento_raw: c.data_pagamento,
                                data_pagamento_formatada: dataPgto
                            });
                        }
                        
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
    
    // Se já tem hora (ISO completo), usa direto
    if (dateString.includes('T')) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }
    
    // Se não tem hora, adiciona
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function getFrequenciaText(freq) {
    const map = {
        'MENSAL': 'Mensal',
        'ANUAL': 'Anual',
        'UNICA': 'Única'
    };
    return map[freq] || freq;
}

function getStatusDinamico(conta) {
    if (conta.status === 'PAGO') return 'PAGO';
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVenc = new Date(conta.data_vencimento + 'T00:00:00');
    dataVenc.setHours(0, 0, 0, 0);
    
    // VENCIDO = vence hoje OU já passou (<=)
    if (dataVenc <= hoje) return 'VENCIDO';
    
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 15);
    
    if (dataVenc <= quinzeDias) return 'EMINENTE';
    
    return 'PENDENTE';
}

function getStatusBadge(status) {
    const statusMap = {
        'PAGO': { class: 'entregue', text: 'Pago' },
        'VENCIDO': { class: 'devolvido', text: 'Vencido' },
        'EMINENTE': { class: 'rota', text: 'Eminente' },
        'PENDENTE': { class: 'transito', text: 'Pendente' }
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
