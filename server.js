const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
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
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) return next();

    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) {
        console.log('❌ Token não fornecido');
        return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            console.log('❌ Sessão inválida - Status:', verifyResponse.status);
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        const sessionData = await verifyResponse.json();
        if (!sessionData.valid) {
            console.log('❌ Sessão não válida');
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        console.log('✅ Autenticação OK');
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error.message);
        return res.status(500).json({ error: 'Erro ao verificar autenticação', details: error.message });
    }
}

// =====================================================
// NOVO: GET /api/contas/grupo/:grupoId
// Retorna todas as parcelas de um grupo
// =====================================================
app.get('/api/contas/grupo/:grupoId', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`📋 Buscando parcelas do grupo: ${req.params.grupoId}`);
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .eq('grupo_id', req.params.grupoId)
            .order('parcela_numero', { ascending: true });

        if (error) {
            console.error('❌ Erro Supabase:', error);
            throw error;
        }
        
        console.log(`✅ ${data?.length || 0} parcelas encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro ao buscar parcelas do grupo:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar parcelas do grupo',
            message: error.message
        });
    }
});

// GET /api/contas
app.get('/api/contas', verificarAutenticacao, async (req, res) => {
    try {
        console.log('📋 Listando contas...');
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .order('data_vencimento', { ascending: true });

        if (error) {
            console.error('❌ Erro Supabase ao listar:', error);
            throw error;
        }
        
        console.log(`✅ ${data?.length || 0} contas encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro ao listar contas:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao listar contas',
            message: error.message,
            details: error.details || error.hint
        });
    }
});

// GET /api/contas/:id
app.get('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🔍 Buscando conta ID: ${req.params.id}`);
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('❌ Conta não encontrada');
                return res.status(404).json({ success: false, error: 'Conta não encontrada' });
            }
            console.error('❌ Erro Supabase:', error);
            throw error;
        }

        console.log('✅ Conta encontrada');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar conta:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar conta',
            message: error.message
        });
    }
});

// POST /api/contas
app.post('/api/contas', verificarAutenticacao, async (req, res) => {
    try {
        console.log('➕ Criando nova conta...');
        const { documento, descricao, valor, data_vencimento, forma_pagamento, banco, data_pagamento, observacoes, parcela_numero, parcela_total, status, grupo_id } = req.body;

        // Validação detalhada
        const camposObrigatorios = { descricao, valor, data_vencimento, forma_pagamento, banco };
        const camposFaltando = Object.entries(camposObrigatorios)
            .filter(([key, value]) => !value)
            .map(([key]) => key);

        if (camposFaltando.length > 0) {
            console.log('❌ Campos obrigatórios faltando:', camposFaltando);
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios faltando',
                campos_faltando: camposFaltando
            });
        }

        // Validar valor numérico
        const valorNumerico = parseFloat(valor);
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            console.log('❌ Valor inválido:', valor);
            return res.status(400).json({
                success: false,
                error: 'Valor deve ser um número maior que zero',
                valor_recebido: valor
            });
        }

        // Validar data_vencimento
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data_vencimento)) {
            console.log('❌ Data de vencimento inválida:', data_vencimento);
            return res.status(400).json({
                success: false,
                error: 'Data de vencimento deve estar no formato YYYY-MM-DD',
                data_recebida: data_vencimento
            });
        }

        // Gerar grupo_id se não fornecido
        const finalGrupoId = grupo_id || uuidv4();

        const novaConta = {
            documento: documento || null,
            descricao,
            valor: valorNumerico,
            data_vencimento,
            forma_pagamento,
            banco,
            data_pagamento: data_pagamento || null,
            observacoes: observacoes || null,
            parcela_numero: parcela_numero || null,
            parcela_total: parcela_total || null,
            status: status || (data_pagamento ? 'PAGO' : 'PENDENTE'),
            grupo_id: finalGrupoId
        };

        console.log('📤 Dados a inserir:', JSON.stringify(novaConta, null, 2));

        const { data, error } = await supabase
            .from('contas_pagar')
            .insert([novaConta])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro Supabase ao inserir:', error);
            console.error('Detalhes:', error.details);
            console.error('Hint:', error.hint);
            console.error('Message:', error.message);
            throw error;
        }

        console.log('✅ Conta criada com sucesso! ID:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro ao criar conta:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar conta',
            message: error.message,
            details: error.details || error.hint,
            code: error.code
        });
    }
});

// PUT /api/contas/:id
app.put('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`✏️ Atualizando conta ID: ${req.params.id}`);
        const { documento, descricao, valor, data_vencimento, forma_pagamento, banco, data_pagamento, observacoes, parcela_numero, parcela_total, status } = req.body;

        // Validar valor numérico
        const valorNumerico = parseFloat(valor);
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            console.log('❌ Valor inválido:', valor);
            return res.status(400).json({
                success: false,
                error: 'Valor deve ser um número maior que zero'
            });
        }

        const contaAtualizada = {
            documento: documento || null,
            descricao,
            valor: valorNumerico,
            data_vencimento,
            forma_pagamento,
            banco,
            data_pagamento: data_pagamento || null,
            observacoes: observacoes || null,
            parcela_numero: parcela_numero || null,
            parcela_total: parcela_total || null,
            status: status || (data_pagamento ? 'PAGO' : 'PENDENTE')
        };

        console.log('📤 Dados a atualizar:', JSON.stringify(contaAtualizada, null, 2));

        const { data, error } = await supabase
            .from('contas_pagar')
            .update(contaAtualizada)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('❌ Conta não encontrada');
                return res.status(404).json({ success: false, error: 'Conta não encontrada' });
            }
            console.error('❌ Erro Supabase:', error);
            throw error;
        }

        console.log('✅ Conta atualizada com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar conta',
            message: error.message
        });
    }
});

// PATCH /api/contas/:id
app.patch('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🔄 Atualizando parcialmente conta ID: ${req.params.id}`);
        const updates = {};
        if (req.body.status !== undefined) updates.status = req.body.status;
        if (req.body.data_pagamento !== undefined) updates.data_pagamento = req.body.data_pagamento;

        console.log('📤 Updates:', JSON.stringify(updates, null, 2));

        const { data, error } = await supabase
            .from('contas_pagar')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('❌ Conta não encontrada');
                return res.status(404).json({ success: false, error: 'Conta não encontrada' });
            }
            console.error('❌ Erro Supabase:', error);
            throw error;
        }

        console.log('✅ Conta atualizada com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar conta',
            message: error.message
        });
    }
});

// DELETE /api/contas/:id
app.delete('/api/contas/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🗑️ Deletando conta ID: ${req.params.id}`);
        const { error } = await supabase
            .from('contas_pagar')
            .delete()
            .eq('id', req.params.id);

        if (error) {
            console.error('❌ Erro Supabase:', error);
            throw error;
        }

        console.log('✅ Conta deletada com sucesso!');
        res.json({ success: true, message: 'Conta removida com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar conta:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao deletar conta',
            message: error.message
        });
    }
});

// ROTAS DE SAÚDE
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// TRATAMENTO GLOBAL DE ERROS
app.use((err, req, res, next) => {
    console.error('❌ Erro não tratado:', err);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('');
    console.log('===============================================');
    console.log('🚀 CONTAS A PAGAR');
    console.log('===============================================');
    console.log(`✅ Porta: ${PORT}`);
    console.log(`✅ Supabase: ${supabaseUrl}`);
    console.log(`✅ Portal: ${PORTAL_URL}`);
    console.log('===============================================');
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;
