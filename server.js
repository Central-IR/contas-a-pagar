// ============================================
// SERVIDOR NODE.JS - CONTAS A PAGAR
// API com CORS configurado para Render
// ============================================

const express = require('express');
const cors = require('cors');
const app = express();

// ============================================
// CONFIGURAÇÃO DE CORS
// ============================================

// Lista de origens permitidas (adicione todos os domínios que precisam acessar a API)
const allowedOrigins = [
    'https://contas-a-pagar-ytr6.onrender.com',
    'https://ir-comercio-portal-zcan.onrender.com',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000'
];

// Configuração do CORS
const corsOptions = {
    origin: function (origin, callback) {
        // Permitir requisições sem origin (mobile apps, Postman, etc)
        if (!origin) return callback(null, true);
        
        // Verificar se a origin está na lista de permitidas
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('❌ Origin bloqueada:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Permite cookies e autenticação
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // Cache preflight por 24 horas
};

// Aplicar CORS
app.use(cors(corsOptions));

// ============================================
// MIDDLEWARES
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de todas as requisições
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'no-origin'}`);
    next();
});

// ============================================
// ARMAZENAMENTO EM MEMÓRIA
// ============================================

let contas = [];

// Dados de exemplo (opcional - remover em produção)
contas = [
    {
        id: '1',
        descricao: 'ENERGIA ELÉTRICA',
        valor: 350.00,
        data_vencimento: '2025-12-10',
        frequencia: 'PARCELA_UNICA',
        forma_pagamento: 'BOLETO',
        banco: 'BANCO DO BRASIL',
        status: 'PENDENTE',
        data_pagamento: null,
        observacoes: 'Conta de energia',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '2',
        descricao: 'TELEFONE',
        valor: 89.90,
        data_vencimento: '2025-12-05',
        frequencia: 'PARCELA_UNICA',
        forma_pagamento: 'DEBITO',
        banco: 'BRADESCO',
        status: 'PENDENTE',
        data_pagamento: null,
        observacoes: 'Conta telefônica',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

// Calcular status dinâmico
function calcularStatusDinamico(conta) {
    if (conta.status === 'PAGO') return 'PAGO';
    if (conta.status === 'CANCELADO') return 'CANCELADO';
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const vencimento = new Date(conta.data_vencimento + 'T00:00:00');
    vencimento.setHours(0, 0, 0, 0);
    
    const diff = Math.floor((vencimento - hoje) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return 'VENCIDO';
    if (diff <= 15) return 'IMINENTE';
    return 'PENDENTE';
}

// Gerar ID único
function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ============================================
// ROTAS DA API
// ============================================

// Rota raiz - Health Check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'API Contas a Pagar está funcionando! ✅',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            contas: '/api/contas',
            health: '/health'
        }
    });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        totalContas: contas.length
    });
});

// ============================================
// ROTAS DE CONTAS
// ============================================

// GET /api/contas - Listar todas as contas
app.get('/api/contas', (req, res) => {
    try {
        const contasComStatus = contas.map(conta => ({
            ...conta,
            status_dinamico: calcularStatusDinamico(conta)
        }));
        
        res.json({
            success: true,
            data: contasComStatus,
            total: contasComStatus.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erro ao listar contas:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar contas',
            message: error.message
        });
    }
});

// GET /api/contas/:id - Buscar conta específica
app.get('/api/contas/:id', (req, res) => {
    try {
        const conta = contas.find(c => c.id === req.params.id);
        
        if (!conta) {
            return res.status(404).json({
                success: false,
                error: 'Conta não encontrada'
            });
        }
        
        res.json({
            success: true,
            data: {
                ...conta,
                status_dinamico: calcularStatusDinamico(conta)
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar conta:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar conta',
            message: error.message
        });
    }
});

// POST /api/contas - Criar nova conta
app.post('/api/contas', (req, res) => {
    try {
        const novaConta = {
            id: gerarId(),
            ...req.body,
            status: req.body.status || 'PENDENTE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        // Validações básicas
        if (!novaConta.descricao || !novaConta.valor || !novaConta.data_vencimento) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios faltando',
                required: ['descricao', 'valor', 'data_vencimento']
            });
        }
        
        contas.push(novaConta);
        
        res.status(201).json({
            success: true,
            message: 'Conta criada com sucesso',
            data: {
                ...novaConta,
                status_dinamico: calcularStatusDinamico(novaConta)
            }
        });
    } catch (error) {
        console.error('❌ Erro ao criar conta:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao criar conta',
            message: error.message
        });
    }
});

// PUT /api/contas/:id - Atualizar conta completa
app.put('/api/contas/:id', (req, res) => {
    try {
        const index = contas.findIndex(c => c.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Conta não encontrada'
            });
        }
        
        const contaAtualizada = {
            ...contas[index],
            ...req.body,
            id: req.params.id, // Mantém o ID original
            updated_at: new Date().toISOString()
        };
        
        contas[index] = contaAtualizada;
        
        res.json({
            success: true,
            message: 'Conta atualizada com sucesso',
            data: {
                ...contaAtualizada,
                status_dinamico: calcularStatusDinamico(contaAtualizada)
            }
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar conta',
            message: error.message
        });
    }
});

// PATCH /api/contas/:id - Atualizar parcialmente
app.patch('/api/contas/:id', (req, res) => {
    try {
        const index = contas.findIndex(c => c.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Conta não encontrada'
            });
        }
        
        // Atualiza apenas os campos enviados
        contas[index] = {
            ...contas[index],
            ...req.body,
            id: req.params.id,
            updated_at: new Date().toISOString()
        };
        
        res.json({
            success: true,
            message: 'Conta atualizada com sucesso',
            data: {
                ...contas[index],
                status_dinamico: calcularStatusDinamico(contas[index])
            }
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar conta',
            message: error.message
        });
    }
});

// DELETE /api/contas/:id - Deletar conta
app.delete('/api/contas/:id', (req, res) => {
    try {
        const index = contas.findIndex(c => c.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Conta não encontrada'
            });
        }
        
        const contaRemovida = contas.splice(index, 1)[0];
        
        res.json({
            success: true,
            message: 'Conta removida com sucesso',
            data: contaRemovida
        });
    } catch (error) {
        console.error('❌ Erro ao deletar conta:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao deletar conta',
            message: error.message
        });
    }
});

// ============================================
// ROTAS DE DASHBOARD
// ============================================

// GET /api/dashboard - Estatísticas
app.get('/api/dashboard', (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const stats = {
            total: contas.length,
            pagos: 0,
            vencidos: 0,
            iminentes: 0,
            pendentes: 0,
            valor_total: 0,
            valor_pago: 0,
            valor_pendente: 0
        };
        
        contas.forEach(conta => {
            const statusDinamico = calcularStatusDinamico(conta);
            stats.valor_total += parseFloat(conta.valor);
            
            if (statusDinamico === 'PAGO') {
                stats.pagos++;
                stats.valor_pago += parseFloat(conta.valor);
            } else {
                stats.valor_pendente += parseFloat(conta.valor);
                
                if (statusDinamico === 'VENCIDO') stats.vencidos++;
                else if (statusDinamico === 'IMINENTE') stats.iminentes++;
                else if (statusDinamico === 'PENDENTE') stats.pendentes++;
            }
        });
        
        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erro ao gerar dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao gerar dashboard',
            message: error.message
        });
    }
});

// ============================================
// TRATAMENTO DE ERROS 404
// ============================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Rota não encontrada',
        path: req.path,
        method: req.method
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('');
    console.log('===============================================');
    console.log('🚀 SERVIDOR CONTAS A PAGAR - INICIADO');
    console.log('===============================================');
    console.log(`✅ Servidor rodando na porta: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📊 Total de contas: ${contas.length}`);
    console.log('');
    console.log('📋 Endpoints disponíveis:');
    console.log('   GET    /                - Health check');
    console.log('   GET    /health          - Status do servidor');
    console.log('   GET    /api/contas      - Listar todas as contas');
    console.log('   GET    /api/contas/:id  - Buscar conta específica');
    console.log('   POST   /api/contas      - Criar nova conta');
    console.log('   PUT    /api/contas/:id  - Atualizar conta');
    console.log('   PATCH  /api/contas/:id  - Atualizar parcialmente');
    console.log('   DELETE /api/contas/:id  - Deletar conta');
    console.log('   GET    /api/dashboard   - Estatísticas');
    console.log('');
    console.log('🔐 CORS configurado para:');
    allowedOrigins.forEach(origin => {
        console.log(`   ✓ ${origin}`);
    });
    console.log('===============================================');
    console.log('');
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;
