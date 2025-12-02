const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();

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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filepath) => {
        if (filepath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
        else if (filepath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        else if (filepath.endsWith('.html')) res.setHeader('Content-Type', 'text/html');
    }
}));

app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) return next();

    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        const sessionData = await verifyResponse.json();
        if (!sessionData.valid) {
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return res.status(500).json({ error: 'Erro ao verificar autenticação' });
    }
}

// GET /api/contas
app.get('/api/contas', verificarAutenticacao, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .order('data_vencimento', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro ao listar contas:', error);
        res.status(500).json({ success: false, error: 'Erro ao listar contas' });
    }
});

// GET /api/contas/:id
app.get('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Conta não encontrada' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar conta:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar conta' });
    }
});

// POST /api/contas
app.post('/api/contas', verificarAutenticacao, async (req, res) => {
    try {
        const { descricao, valor, data_vencimento, forma_pagamento, banco, data_pagamento, observacoes, parcela_numero, parcela_total } = req.body;

        if (!descricao || !valor || !data_vencimento || !forma_pagamento || !banco) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios faltando'
            });
        }

        const novaConta = {
            descricao,
            valor: parseFloat(valor),
            data_vencimento,
            forma_pagamento,
            banco,
            data_pagamento: data_pagamento || null,
            observacoes: observacoes || null,
            parcela_numero: parcela_numero || null,
            parcela_total: parcela_total || null,
            status: data_pagamento ? 'PAGO' : 'PENDENTE'
        };

        const { data, error } = await supabase
            .from('contas_pagar')
            .insert([novaConta])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro ao criar conta:', error);
        res.status(500).json({ success: false, error: 'Erro ao criar conta' });
    }
});

// PUT /api/contas/:id
app.put('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        const { descricao, valor, data_vencimento, forma_pagamento, banco, data_pagamento, observacoes, parcela_numero, parcela_total, status } = req.body;

        const contaAtualizada = {
            descricao,
            valor: parseFloat(valor),
            data_vencimento,
            forma_pagamento,
            banco,
            data_pagamento: data_pagamento || null,
            observacoes: observacoes || null,
            parcela_numero: parcela_numero || null,
            parcela_total: parcela_total || null,
            status: status || (data_pagamento ? 'PAGO' : 'PENDENTE')
        };

        const { data, error } = await supabase
            .from('contas_pagar')
            .update(contaAtualizada)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Conta não encontrada' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error);
        res.status(500).json({ success: false, error: 'Erro ao atualizar conta' });
    }
});

// PATCH /api/contas/:id
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
                return res.status(404).json({ success: false, error: 'Conta não encontrada' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error);
        res.status(500).json({ success: false, error: 'Erro ao atualizar conta' });
    }
});

// DELETE /api/contas/:id
app.delete('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        const { error } = await supabase
            .from('contas_pagar')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ success: true, message: 'Conta removida com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar conta:', error);
        res.status(500).json({ success: false, error: 'Erro ao deletar conta' });
    }
});

// ROTAS DE SAÚDE
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('');
    console.log('===============================================');
    console.log('🚀 CONTAS A PAGAR');
    console.log('===============================================');
    console.log(`✅ Porta: ${PORT}`);
    console.log('===============================================');
});

process.on('unhandledRejection', (reason) => console.error('❌ Erro:', reason));
process.on('uncaughtException', (error) => { console.error('❌ Erro:', error); process.exit(1); });

module.exports = app;
