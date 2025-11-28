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

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

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
            console.log('✅ SERVIDOR ONLINE');
            await loadContas();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
        if (statusText) {
            statusText.textContent = isOnline ? 'Online' : 'Offline';
        }
    }
}

// ============================================
// CARREGAMENTO DE DADOS
// ============================================
async function loadContas() {
    if (!isOnline) {
        console.log('⚠️ Sistema offline - não carregando contas');
        return;
    }

    try {
        console.log('📡 Carregando contas da API...');
        const response = await fetch(`${API_URL}/contas`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            console.error('❌ Sessão expirou');
            sessionStorage.removeItem('contasPagarSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            console.error('❌ Erro na resposta:', response.status);
            return;
        }

        const data = await response.json();
        console.log('✅ Dados recebidos:', data.length, 'contas');
        console.log('📋 Contas:', data);
        
        contas = data;
        
        const newHash = JSON.stringify(contas.map(c => c.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            console.log(`🔄 ${contas.length} contas carregadas e atualizadas`);
            updateAllFilters();
            updateDashboard();
            filterContas();
        } else {
            console.log('ℹ️ Sem mudanças nos dados');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar:', error);
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
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 15);
    
    const contasDoMes = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });
    
    // Calcular valores pagos
    const valorPago = contasDoMes
        .filter(c => c.status === 'PAGO')
        .reduce((sum, c) => sum + parseFloat(c.valor || 0), 0);
    
    // Calcular contas vencidas
    const vencido = contasDoMes.filter(c => {
        if (c.status === 'PAGO') return false;
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        dataVenc.setHours(0, 0, 0, 0);
        return dataVenc < hoje;
    }).length;
    
    // Calcular contas iminentes
    const iminente = contasDoMes.filter(c => {
        if (c.status === 'PAGO') return false;
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        dataVenc.setHours(0, 0, 0, 0);
        return dataVenc >= hoje && dataVenc <= quinzeDias;
    }).length;
    
    // Calcular valor total
    const valorTotal = contasDoMes.reduce((sum, c) => sum + parseFloat(c.valor || 0), 0);
    
    document.getElementById('statPagos').textContent = `R$ ${valorPago.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('statVencido').textContent = vencido;
    document.getElementById('statIminente').textContent = iminente;
    document.getElementById('statValorTotal').textContent = `R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    const cardVencido = document.getElementById('cardVencido');
    const badgeVencido = document.getElementById('pulseBadgeVencido');
    if (vencido > 0) {
        cardVencido.classList.add('has-alert');
        badgeVencido.style.display = 'flex';
        badgeVencido.textContent = vencido;
    } else {
        cardVencido.classList.remove('has-alert');
        badgeVencido.style.display = 'none';
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
// FORMULÁRIO
// ============================================
window.toggleForm = function() {
    showFormModal(null);
};

function showFormModal(editingId) {
    const isEditing = editingId !== null;
    let conta = null;
    
    if (isEditing) {
        conta = contas.find(c => String(c.id) === String(editingId));
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
                                    <label for="data_vencimento">Vencimento *</label>
                                    <input type="date" id="data_vencimento" value="${conta?.data_vencimento || ''}" required>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <div class="checkbox-fixa-wrapper">
                                        <input type="checkbox" id="fixa" ${conta?.fixa ? 'checked' : ''}>
                                        <label for="fixa">Esta é uma conta fixa (se repetirá todos os meses)</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-pagamento">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="forma_pagamento">Forma de Pagamento *</label>
                                    <select id="forma_pagamento" required>
                                        <option value="">Selecione...</option>
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
                                    <label for="data_pagamento">Data do Pagamento</label>
                                    <input type="date" id="data_pagamento" value="${conta?.data_pagamento || ''}">
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">Observações</label>
                                    <input type="text" id="observacoes" value="${conta?.observacoes || ''}">
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="submit" class="save">Salvar</button>
                            <button type="button" class="danger" onclick="closeFormModal()">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    ['descricao', 'observacoes'].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.addEventListener('input', e => {
            const pos = e.target.selectionStart;
            e.target.value = e.target.value.toUpperCase();
            e.target.setSelectionRange(pos, pos);
        });
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

window.switchFormTab = function(index) {
    document.querySelectorAll('#formModal .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    document.querySelectorAll('#formModal .tab-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

// ============================================
// SUBMIT
// ============================================
async function handleSubmit(event) {
    event.preventDefault();
    
    const formData = {
        descricao: document.getElementById('descricao').value.trim(),
        valor: parseFloat(document.getElementById('valor').value),
        data_vencimento: document.getElementById('data_vencimento').value,
        forma_pagamento: document.getElementById('forma_pagamento').value,
        banco: document.getElementById('banco').value,
        data_pagamento: document.getElementById('data_pagamento').value || null,
        observacoes: document.getElementById('observacoes').value.trim() || null,
        fixa: document.getElementById('fixa').checked
    };

    const editId = document.getElementById('editId').value;
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

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao salvar');
        }

        const savedData = await response.json();

        if (editId) {
            const index = contas.findIndex(c => String(c.id) === String(editId));
            if (index !== -1) contas[index] = savedData;
            showMessage('Conta atualizada!', 'success');
        } else {
            contas.push(savedData);
            showMessage('Conta criada!', 'success');
        }

        lastDataHash = JSON.stringify(contas.map(c => c.id));
        updateAllFilters();
        updateDashboard();
        filterContas();
        closeFormModal();
    } catch (error) {
        console.error('Erro:', error);
        showMessage(`Erro: ${error.message}`, 'error');
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

            if (response.status === 401) {
                sessionStorage.removeItem('contasPagarSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

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
// EDIÇÃO
// ============================================
window.editConta = function(id) {
    showFormModal(String(id));
};

// ============================================
// EXCLUSÃO
// ============================================
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

            if (response.status === 401) {
                sessionStorage.removeItem('contasPagarSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

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

    const modal = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Conta</h3>
                </div>
                <div class="info-section">
                    <p><strong>Descrição:</strong> ${conta.descricao}</p>
                    <p><strong>Valor:</strong> R$ ${parseFloat(conta.valor).toFixed(2)}</p>
                    <p><strong>Vencimento:</strong> ${formatDate(conta.data_vencimento)}</p>
                    <p><strong>Forma de Pagamento:</strong> ${conta.forma_pagamento}</p>
                    <p><strong>Banco:</strong> ${conta.banco}</p>
                    <p><strong>Conta Fixa:</strong> ${conta.fixa ? 'Sim' : 'Não'}</p>
                    ${conta.data_pagamento ? `<p><strong>Data do Pagamento:</strong> ${formatDate(conta.data_pagamento)}</p>` : '<p><strong>Status:</strong> Não pago</p>'}
                    ${conta.observacoes ? `<p><strong>Observações:</strong> ${conta.observacoes}</p>` : ''}
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
    
    // Analisar contas do mês atual para determinar status
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const quinze = new Date(hoje);
    quinze.setDate(quinze.getDate() + 15);
    
    const contasDoMes = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        return dataVenc.getMonth() === currentMonth && dataVenc.getFullYear() === currentYear;
    });
    
    let temVencido = false, temIminente = false, temPago = false, temPendente = false;
    
    contasDoMes.forEach(c => {
        if (c.status === 'PAGO') {
            temPago = true;
        } else {
            const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
            dataVenc.setHours(0, 0, 0, 0);
            
            if (dataVenc < hoje) {
                temVencido = true;
            } else if (dataVenc <= quinze) {
                temIminente = true;
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
        if (temIminente) statusSelect.innerHTML += '<option value="IMINENTE">Iminente</option>';
        if (temPendente) statusSelect.innerHTML += '<option value="PENDENTE">Pendente</option>';
        statusSelect.value = val;
    }
}

function filterContas() {
    const search = (document.getElementById('search')?.value || '').toLowerCase();
    const banco = document.getElementById('filterBanco')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const pagamento = document.getElementById('filterPagamento')?.value || '';
    
    console.log('🔍 Filtros ativos:', { search, banco, status, pagamento, currentMonth, currentYear });
    console.log('📊 Total de contas no array:', contas.length);
    
    // Filtrar apenas por mês/ano da data de vencimento
    let filtered = contas.filter(c => {
        const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
        const mesMatch = dataVenc.getMonth() === currentMonth;
        const anoMatch = dataVenc.getFullYear() === currentYear;
        return mesMatch && anoMatch;
    });
    
    console.log('📅 Contas do mês selecionado:', filtered.length);

    // Aplicar filtros adicionais
    if (banco) {
        filtered = filtered.filter(c => c.banco === banco);
        console.log('🏦 Após filtro banco:', filtered.length);
    }
    
    if (pagamento) {
        filtered = filtered.filter(c => c.forma_pagamento === pagamento);
        console.log('💳 Após filtro pagamento:', filtered.length);
    }
    
    // Filtro de status - calcular dinamicamente
    if (status) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const quinze = new Date(hoje);
        quinze.setDate(quinze.getDate() + 15);
        
        const beforeFilter = filtered.length;
        
        filtered = filtered.filter(c => {
            if (status === 'PAGO') return c.status === 'PAGO';
            
            if (status === 'VENCIDO') {
                if (c.status === 'PAGO') return false;
                const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
                dataVenc.setHours(0, 0, 0, 0);
                return dataVenc < hoje;
            }
            
            if (status === 'IMINENTE') {
                if (c.status === 'PAGO') return false;
                const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
                dataVenc.setHours(0, 0, 0, 0);
                return dataVenc >= hoje && dataVenc <= quinze;
            }
            
            if (status === 'PENDENTE') {
                if (c.status === 'PAGO') return false;
                const dataVenc = new Date(c.data_vencimento + 'T00:00:00');
                dataVenc.setHours(0, 0, 0, 0);
                return dataVenc > quinze;
            }
            
            return true;
        });
        
        console.log(`🎯 Após filtro status "${status}":`, beforeFilter, '→', filtered.length);
    }

    // Filtro de busca
    if (search) {
        const beforeSearch = filtered.length;
        filtered = filtered.filter(c => 
            (c.descricao || '').toLowerCase().includes(search) ||
            (c.banco || '').toLowerCase().includes(search) ||
            (c.forma_pagamento || '').toLowerCase().includes(search)
        );
        console.log('🔎 Após busca:', beforeSearch, '→', filtered.length);
    }

    // Ordenar por data de vencimento
    filtered.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
    
    console.log('✅ Renderizando', filtered.length, 'contas');
    renderContas(filtered);
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderContas(lista) {
    const container = document.getElementById('contasContainer');
    
    console.log('🎨 Renderizando contas...');
    console.log('📦 Container encontrado:', !!container);
    console.log('📋 Quantidade para renderizar:', lista?.length || 0);
    
    if (!container) {
        console.error('❌ Container #contasContainer não encontrado!');
        return;
    }
    
    if (!lista || lista.length === 0) {
        console.log('ℹ️ Nenhuma conta para exibir');
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhuma conta encontrada para este período</div>';
        return;
    }

    console.log('✅ Gerando tabela com', lista.length, 'linhas');

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th style="text-align: center; width: 60px;"> </th>
                        <th>Descrição</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Banco</th>
                        <th>Pagamento</th>
                        <th>Status</th>
                        <th style="text-align: center; min-width: 260px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(c => {
                        console.log('  ➜ Renderizando conta:', c.id, c.descricao);
                        return `
                        <tr class="${c.status === 'PAGO' ? 'row-pago' : ''}">
                            <td style="text-align: center;">
                                <button class="check-btn ${c.status === 'PAGO' ? 'checked' : ''}" 
                                        onclick="togglePago('${c.id}')" 
                                        title="${c.status === 'PAGO' ? 'Marcar como pendente' : 'Marcar como pago'}">
                                        ✓
                                </button>
                            </td>
                            <td>${c.descricao}${c.fixa ? ' <strong>(Fixa)</strong>' : ''}</td>
                            <td><strong>R$ ${parseFloat(c.valor).toFixed(2)}</strong></td>
                            <td>${formatDate(c.data_vencimento)}</td>
                            <td>${c.banco}</td>
                            <td>${c.forma_pagamento}</td>
                            <td>${getStatusBadge(getStatusDinamico(c))}</td>
                            <td class="actions-cell" style="text-align: center;">
                                <button onclick="viewConta('${c.id}')" class="action-btn view">Ver</button>
                                <button onclick="editConta('${c.id}')" class="action-btn edit">Editar</button>
                                <button onclick="deleteConta('${c.id}')" class="action-btn delete">Excluir</button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
    console.log('✅ Tabela inserida no DOM');
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
    if (dataVenc < hoje) return 'VENCIDO';
    const quinze = new Date(hoje);
    quinze.setDate(quinze.getDate() + 15);
    if (dataVenc <= quinze) return 'IMINENTE';
    return 'PENDENTE';
}

function getStatusBadge(status) {
    const map = {
        'PAGO': { class: 'pago', text: 'Pago' },
        'VENCIDO': { class: 'vencido', text: 'Vencido' },
        'IMINENTE': { class: 'iminente', text: 'Iminente' },
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
