require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Session-Token', 'Accept']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de autenticação simples
const authenticateToken = (req, res, next) => {
    const token = req.headers['x-session-token'];
    
    if (!token) {
        return res.status(401).json({ error: 'NÃO AUTORIZADO' });
    }
    
    // Aqui você pode validar o token com seu portal de autenticação
    // Por enquanto, apenas verificamos se existe
    req.sessionToken = token;
    next();
};

// ============================================
// ROTAS DA API
// ============================================

// GET - Listar todas as contas
app.get('/api/contas', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contas_pagar')
            .select('*')
            .order('data_vencimento', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar contas:', error);
        res.status(500).json({ error: 'ERRO AO BUSCAR CONTAS' });
    }
});

// POST - Criar nova conta
app.post('/api/contas', authenticateToken, async (req, res) => {
    try {
        const {
            descricao,
            valor,
            data_vencimento,
            frequencia,
            forma_pagamento,
            banco,
            observacoes
        } = req.body;

        // Validação básica
        if (!descricao || !valor || !data_vencimento || !frequencia || !forma_pagamento || !banco) {
            return res.status(400).json({ error: 'CAMPOS OBRIGATÓRIOS FALTANDO' });
        }

        // Converter MAIÚSCULAS
        const descricaoUpper = descricao.toUpperCase();
        const observacoesUpper = observacoes ? observacoes.toUpperCase() : null;

        // Determinar parcelas
        let parcela_atual = null;
        let total_parcelas = null;
        let grupo_parcelas = null;

        if (frequencia !== 'PARCELA_UNICA') {
            // Extrair número da parcela (ex: "2_PARCELA" -> 2)
            const match = frequencia.match(/(\d+)_PARCELA/);
            if (match) {
                parcela_atual = parseInt(match[1]);
                total_parcelas = parcela_atual; // Será atualizado se criar mais parcelas
                grupo_parcelas = uuidv4();
            }
        }

        const novaConta = {
            descricao: descricaoUpper,
            valor: parseFloat(valor),
            data_vencimento,
            frequencia,
            forma_pagamento,
            banco,
            observacoes: observacoesUpper,
            status: 'PENDENTE',
            data_pagamento: null,
            parcela_atual,
            total_parcelas,
            grupo_parcelas
        };

        const { data, error } = await supabase
            .from('contas_pagar')
            .insert([novaConta])
            .select()
            .single();

        if (error) throw error;

        // Se for parcela 1 ou superior, criar as parcelas futuras
        if (parcela_atual && parcela_atual >= 1) {
            await criarParcelasFuturas(data, parcela_atual);
        }

        res.status(201).json(data);
    } catch (error) {
        console.error('Erro ao criar conta:', error);
        res.status(500).json({ error: 'ERRO AO CRIAR CONTA' });
    }
});

// Função auxiliar para criar parcelas futuras
async function criarParcelasFuturas(contaBase, parcelaInicial) {
    try {
        // Não cria parcelas futuras para parcela única
        if (contaBase.frequencia === 'PARCELA_UNICA') return;

        const parcelas = [];
        const dataBase = new Date(contaBase.data_vencimento);
        
        // Criar até 12 parcelas (ou o número que você preferir)
        for (let i = parcelaInicial + 1; i <= 12; i++) {
            const novaData = new Date(dataBase);
            novaData.setMonth(dataBase.getMonth() + (i - parcelaInicial));

            parcelas.push({
                descricao: contaBase.descricao,
                valor: contaBase.valor,
                data_vencimento: novaData.toISOString().split('T')[0],
                frequencia: `${i}_PARCELA`,
                forma_pagamento: contaBase.forma_pagamento,
                banco: contaBase.banco,
                observacoes: contaBase.observacoes,
                status: 'PENDENTE',
                data_pagamento: null,
                parcela_atual: i,
                total_parcelas: 12, // Atualizar conforme necessário
                grupo_parcelas: contaBase.grupo_parcelas
            });
        }

        if (parcelas.length > 0) {
            const { error } = await supabase
                .from('contas_pagar')
                .insert(parcelas);

            if (error) console.error('Erro ao criar parcelas futuras:', error);
        }
    } catch (error) {
        console.error('Erro na função criarParcelasFuturas:', error);
    }
}

// PUT - Atualizar conta
app.put('/api/contas/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            descricao,
            valor,
            data_vencimento,
            frequencia,
            forma_pagamento,
            banco,
            observacoes,
            status,
            data_pagamento
        } = req.body;

        const updateData = {
            descricao: descricao ? descricao.toUpperCase() : undefined,
            valor: valor ? parseFloat(valor) : undefined,
            data_vencimento,
            frequencia,
            forma_pagamento,
            banco,
            observacoes: observacoes ? observacoes.toUpperCase() : null,
            status,
            data_pagamento
        };

        // Remover undefined
        Object.keys(updateData).forEach(key => 
            updateData[key] === undefined && delete updateData[key]
        );

        const { data, error } = await supabase
            .from('contas_pagar')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar conta:', error);
        res.status(500).json({ error: 'ERRO AO ATUALIZAR CONTA' });
    }
});

// PATCH - Atualizar status (com lógica de parcelas)
app.patch('/api/contas/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, data_pagamento, parcelas_pagas } = req.body;

        // Buscar a conta
        const { data: conta, error: fetchError } = await supabase
            .from('contas_pagar')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // Se está marcando como PAGO e tem grupo de parcelas
        if (status === 'PAGO' && conta.grupo_parcelas && parcelas_pagas) {
            await processarPagamentoParcelas(conta, parcelas_pagas, data_pagamento);
        } else {
            // Atualização simples
            const { data: updated, error } = await supabase
                .from('contas_pagar')
                .update({ status, data_pagamento })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return res.json(updated);
        }

        // Retornar conta atualizada
        const { data: final, error: finalError } = await supabase
            .from('contas_pagar')
            .select('*')
            .eq('id', id)
            .single();

        if (finalError) throw finalError;

        res.json(final);
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ error: 'ERRO AO ATUALIZAR STATUS' });
    }
});

// Função para processar pagamento de parcelas
async function processarPagamentoParcelas(conta, quantidadeParcelas, dataPagamento) {
    try {
        if (quantidadeParcelas === 'TODAS') {
            // Marcar esta como paga e excluir todas as futuras
            await supabase
                .from('contas_pagar')
                .update({ status: 'PAGO', data_pagamento: dataPagamento })
                .eq('id', conta.id);

            // Excluir parcelas futuras
            await supabase
                .from('contas_pagar')
                .delete()
                .eq('grupo_parcelas', conta.grupo_parcelas)
                .gt('parcela_atual', conta.parcela_atual);

        } else if (quantidadeParcelas === 'APENAS_ESTA') {
            // Apenas marcar esta como paga
            await supabase
                .from('contas_pagar')
                .update({ status: 'PAGO', data_pagamento: dataPagamento })
                .eq('id', conta.id);

        } else {
            // Pagar um número específico de parcelas
            const qtd = parseInt(quantidadeParcelas);
            
            // Marcar esta como paga
            await supabase
                .from('contas_pagar')
                .update({ status: 'PAGO', data_pagamento: dataPagamento })
                .eq('id', conta.id);

            // Se pagar mais de uma, excluir as últimas (de trás pra frente)
            if (qtd > 1) {
                const { data: parcelas } = await supabase
                    .from('contas_pagar')
                    .select('*')
                    .eq('grupo_parcelas', conta.grupo_parcelas)
                    .gt('parcela_atual', conta.parcela_atual)
                    .order('parcela_atual', { ascending: false });

                if (parcelas && parcelas.length > 0) {
                    const parcelasParaExcluir = parcelas.slice(0, qtd - 1);
                    const idsParaExcluir = parcelasParaExcluir.map(p => p.id);

                    if (idsParaExcluir.length > 0) {
                        await supabase
                            .from('contas_pagar')
                            .delete()
                            .in('id', idsParaExcluir);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Erro ao processar pagamento de parcelas:', error);
        throw error;
    }
}

// DELETE - Excluir conta
app.delete('/api/contas/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('contas_pagar')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'CONTA EXCLUÍDA COM SUCESSO' });
    } catch (error) {
        console.error('Erro ao excluir conta:', error);
        res.status(500).json({ error: 'ERRO AO EXCLUIR CONTA' });
    }
});

// Rota raiz - servir o HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
    console.log(`📍 AMBIENTE: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
