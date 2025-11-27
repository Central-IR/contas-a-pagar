require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIGURAÇÃO DO SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

// MIDDLEWARES
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requisições
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'];

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de sessão não encontrado'
        });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({
                error: 'Sessão inválida',
                message: 'Sua sessão expirou'
            });
        }

        const sessionData = await verifyResponse.json();

        if (!sessionData.valid) {
            return res.status(401).json({
                error: 'Sessão inválida',
                message: sessionData.message || 'Sua sessão expirou'
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return res.status(500).json({
            error: 'Erro interno',
            message: 'Erro ao verificar autenticação'
        });
    }
}

// GET /api/contas - Listar todas as contas
app.get('/api/contas', verificarAutenticacao, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .order('data_vencimento', { ascending: true });

        if (error) throw error;

        // IMPORTANTE: Retornar array direto, não objeto com data
        const contasComStatus = (data || []).map(conta => ({
            ...conta,
            status_dinamico: calcularStatusDinamico(conta)
        }));
        
        res.json(contasComStatus);
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
app.get('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: 'Conta não encontrada'
                });
            }
            throw error;
        }

        res.json({
            ...data,
            status_dinamico: calcularStatusDinamico(data)
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
app.post('/api/contas', verificarAutenticacao, async (req, res) => {
    try {
        const { descricao, valor, data_vencimento, frequencia, forma_pagamento, banco } = req.body;

        if (!descricao || !valor || !data_vencimento || !frequencia || !forma_pagamento || !banco) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios faltando',
                required: ['descricao', 'valor', 'data_vencimento', 'frequencia', 'forma_pagamento', 'banco']
            });
        }

        const novaConta = {
            descricao,
            valor: parseFloat(valor),
            data_vencimento,
            frequencia,
            forma_pagamento,
            banco,
            observacoes: req.body.observacoes || null,
            status: 'PENDENTE',
            data_pagamento: null
        };

        const { data, error } = await supabase
            .from('contas_pagar')
            .insert([novaConta])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            ...data,
            status_dinamico: calcularStatusDinamico(data)
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
app.put('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        const { descricao, valor, data_vencimento, frequencia, forma_pagamento, banco, observacoes, status, data_pagamento } = req.body;

        const contaAtualizada = {
            descricao,
            valor: parseFloat(valor),
            data_vencimento,
            frequencia,
            forma_pagamento,
            banco,
            observacoes,
            status: status || 'PENDENTE',
            data_pagamento
        };

        const { data, error } = await supabase
            .from('contas_pagar')
            .update(contaAtualizada)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: 'Conta não encontrada'
                });
            }
            throw error;
        }

        res.json({
            ...data,
            status_dinamico: calcularStatusDinamico(data)
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

// PATCH /api/contas/:id - Atualizar parcialmente (para toggle de status)
app.patch('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        const updates = {};
        
        if (req.body.status !== undefined) updates.status = req.body.status;
        if (req.body.data_pagamento !== undefined) updates.data_pagamento = req.body.data_pagamento;

        const { data, error } = await supabase
            .from('contas_pagar')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: 'Conta não encontrada'
                });
            }
            throw error;
        }

        res.json({
            ...data,
            status_dinamico: calcularStatusDinamico(data)
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
app.delete('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        const { error } = await supabase
            .from('contas_pagar')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Conta removida com sucesso'
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
// ROTA RAIZ - SERVIR FRONTEND
// ============================================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('');
    console.log('===============================================');
    console.log('🚀 SERVIDOR UNIFICADO - CONTAS A PAGAR');
    console.log('===============================================');
    console.log(`✅ Servidor rodando na porta: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('');
    console.log('📋 Endpoints disponíveis:');
    console.log('   GET    /                - Frontend');
    console.log('   GET    /health          - Status');
    console.log('   GET    /api/contas      - Listar contas');
    console.log('   GET    /api/contas/:id  - Buscar conta');
    console.log('   POST   /api/contas      - Criar conta');
    console.log('   PUT    /api/contas/:id  - Atualizar conta');
    console.log('   PATCH  /api/contas/:id  - Toggle status');
    console.log('   DELETE /api/contas/:id  - Deletar conta');
    console.log('===============================================');
    console.log('');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;
