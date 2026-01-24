// ===================================
// TESTE COM ESPERA DE CARREGAMENTO
// Cole este código no Console
// ===================================

console.log('⏳ Aguardando script carregar...');

// Função para verificar se o script carregou
function verificarScript() {
    if (typeof contas !== 'undefined' && 
        typeof window.toggleForm === 'function' &&
        typeof window.showFormModal === 'function') {
        
        console.log('');
        console.log('✅ Script carregado com sucesso!');
        console.log('');
        executarTestes();
    } else {
        console.log('⏳ Script ainda não carregou... aguardando...');
        setTimeout(verificarScript, 500);
    }
}

function executarTestes() {
    console.log('=== TESTE COMPLETO ===');
    console.log('');

    // 1. Verificar funções principais
    console.log('1. Funções principais:');
    console.log('  toggleForm:', typeof window.toggleForm);
    console.log('  showFormModal:', typeof window.showFormModal);
    console.log('  editConta:', typeof window.editConta);
    console.log('  viewConta:', typeof window.viewConta);
    console.log('  deleteConta:', typeof window.deleteConta);

    // 2. Verificar variáveis globais
    console.log('');
    console.log('2. Variáveis globais:');
    console.log('  contas:', typeof contas, '- Total:', contas?.length || 0);
    console.log('  sessionToken:', typeof sessionToken, '- Existe:', !!sessionToken);
    console.log('  isOnline:', isOnline);

    // 3. Testar chamadas diretas
    console.log('');
    console.log('3. Tentando abrir modal de nova conta...');
    try {
        window.toggleForm();
        console.log('  ✅ toggleForm() executou sem erros');
        
        // Fechar o modal depois de 2 segundos
        setTimeout(() => {
            const modal = document.getElementById('formModal');
            if (modal) {
                modal.remove();
                console.log('  🚪 Modal fechado automaticamente');
            }
        }, 2000);
    } catch(e) {
        console.error('  ❌ Erro:', e.message);
    }

    // 4. Testar edição (se houver contas)
    if (contas && contas.length > 0) {
        console.log('');
        console.log('4. Tentando abrir modal de edição (em 3 segundos)...');
        setTimeout(() => {
            const primeiraContaId = contas[0].id || contas[0].tempId;
            console.log('  ID da primeira conta:', primeiraContaId);
            
            try {
                window.editConta(primeiraContaId);
                console.log('  ✅ editConta() executou sem erros');
                
                // Fechar o modal depois de 2 segundos
                setTimeout(() => {
                    const modal = document.getElementById('formModal');
                    if (modal) {
                        modal.remove();
                        console.log('  🚪 Modal fechado automaticamente');
                    }
                }, 2000);
            } catch(e) {
                console.error('  ❌ Erro:', e.message);
            }
        }, 3000);
    }

    console.log('');
    console.log('=== TESTE INICIADO - Aguarde os resultados ===');
}

// Iniciar verificação
verificarScript();
